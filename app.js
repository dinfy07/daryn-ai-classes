(() => {
  "use strict";

  const storageKeys = {
    custom: "daryn-ai.custom-classes",
    edits: "daryn-ai.class-edits",
    deleted: "daryn-ai.deleted-classes"
  };

  const classDefaults = {
    "5a": { number: "5", letter: "А", subject: "Математика" },
    "6b": { number: "6", letter: "Б", subject: "Алгебра" },
    "7v": { number: "7", letter: "В", subject: "Геометрия" },
    "8a": { number: "8", letter: "А", subject: "Биология" },
    "9b": { number: "9", letter: "Б", subject: "Қазақстан тарихы" },
    "5v": { number: "5", letter: "В", subject: "Математика" }
  };

  const readStorage = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };

  const writeStorage = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The interface still works for the current page if storage is unavailable.
    }
  };

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const normalize = (value = "") => String(value).trim().toLocaleLowerCase("kk-KZ");

  const initials = (name = "") => name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toLocaleUpperCase("kk-KZ") || "ОҚ";

  let toastTimer;
  const showToast = (message, type = "success") => {
    let toast = document.querySelector(".app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "app-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.append(toast);
    }
    toast.dataset.type = type;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
  };

  const confirmAction = (message) => new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "student-dialog confirm-dialog";
    dialog.innerHTML = `
      <div class="student-dialog-card">
        <div class="student-dialog-head"><div><p class="eyebrow">Растау</p><h2>Әрекетті растаңыз</h2></div><button class="tool-btn" type="button" data-confirm="false" aria-label="Жабу">×</button></div>
        <p class="confirm-dialog-message">${escapeHtml(message)}</p>
        <div class="student-dialog-actions"><button class="btn btn-secondary" type="button" data-confirm="false">Бас тарту</button><button class="btn btn-danger" type="button" data-confirm="true">Жою</button></div>
      </div>`;
    document.body.append(dialog);
    let finished = false;
    const finish = (answer) => {
      if (finished) return;
      finished = true;
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    dialog.querySelectorAll("[data-confirm]").forEach((button) => {
      button.addEventListener("click", () => finish(button.dataset.confirm === "true"));
    });
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) finish(false); });
    dialog.showModal();
  });

  const studentFromRow = (row) => ({
    name: row.querySelector(".student-person strong")?.textContent.trim() || "",
    id: row.querySelector(".student-person div span")?.textContent.replace(/^.*?:\s*/, "").trim() || "",
    contact: row.querySelector(".student-contact")?.textContent.trim() || "",
    status: row.querySelector(".tag")?.textContent.trim() || "Қосылды"
  });

  const avatarClasses = ["", "purple", "green", "orange", "rose"];
  const buildStudentRow = (student, index = 0) => {
    const row = document.createElement("li");
    row.className = "student-row";
    const avatarClass = avatarClasses[index % avatarClasses.length];
    row.innerHTML = `
      <div class="student-person">
        <span class="student-avatar ${avatarClass}">${escapeHtml(initials(student.name))}</span>
        <div><strong>${escapeHtml(student.name)}</strong><span>Оқушы ID: ${escapeHtml(student.id)}</span></div>
      </div>
      <span class="student-contact">${escapeHtml(student.contact ?? "")}</span>
      <div class="student-actions">
        <button class="tool-btn" type="button" data-action="edit-student" aria-label="${escapeHtml(student.name)} — өңдеу">✎</button>
        <button class="tool-btn" type="button" data-action="delete-student" aria-label="${escapeHtml(student.name)} — жою">×</button>
      </div>`;
    return row;
  };

  const setupRoster = (form) => {
    const list = form.querySelector("[data-student-list]");
    if (!list) return null;

    const countLabel = form.querySelector("[data-student-count]");
    const search = form.querySelector("[data-student-search]");
    const mode = form.dataset.mode;
    let editingRow = null;

    const syncCount = () => {
      const count = list.querySelectorAll(".student-row").length;
      if (countLabel) {
        countLabel.textContent = mode === "edit"
          ? `${count} оқушы · Барлық оқушы төменде көрсетілген`
          : `${count} оқушы қосылды`;
      }
    };

    const nextStudentId = () => {
      const numbers = [...list.querySelectorAll(".student-person div span")]
        .map((item) => Number(item.textContent.match(/\d+/)?.[0] || 0));
      return `ST-${String(Math.max(0, ...numbers) + 1).padStart(3, "0")}`;
    };

    const dialog = document.createElement("dialog");
    dialog.className = "student-dialog";
    dialog.innerHTML = `
      <form class="student-dialog-card">
        <div class="student-dialog-head">
          <div><p class="eyebrow">Оқушы</p><h2 data-dialog-title>Оқушы қосу</h2></div>
          <button class="tool-btn" type="button" data-dialog-close aria-label="Жабу">×</button>
        </div>
        <div class="student-dialog-fields">
          <div class="field"><label for="student-name">Аты-жөні <span class="required">*</span></label><input class="control" id="student-name" name="student-name" autocomplete="name" placeholder="мысалы: Аружан Қасым" required></div>
          <div class="field"><label for="student-contact">Байланыс нөмірі <span class="optional">(міндетті емес)</span></label><input class="control" id="student-contact" name="student-contact" type="tel" inputmode="tel" autocomplete="tel" placeholder="мысалы: +7 700 123 45 67"></div>
        </div>
        <div class="student-dialog-actions"><button class="btn btn-secondary" type="button" data-dialog-close>Бас тарту</button><button class="btn btn-primary" type="submit">Сақтау</button></div>
      </form>`;
    document.body.append(dialog);

    const dialogForm = dialog.querySelector("form");
    const nameInput = dialog.querySelector("#student-name");
    const contactInput = dialog.querySelector("#student-contact");
    const title = dialog.querySelector("[data-dialog-title]");

    const openDialog = (row = null) => {
      editingRow = row;
      title.textContent = row ? "Оқушыны өңдеу" : "Оқушы қосу";
      if (row) {
        const student = studentFromRow(row);
        nameInput.value = student.name;
        contactInput.value = student.contact;
      } else {
        dialogForm.reset();
      }
      dialog.showModal();
      requestAnimationFrame(() => nameInput.focus());
    };

    dialog.querySelectorAll("[data-dialog-close]").forEach((button) => {
      button.addEventListener("click", () => dialog.close());
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    dialogForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!dialogForm.reportValidity()) return;
      const previous = editingRow ? studentFromRow(editingRow) : null;
      const student = {
        name: nameInput.value.trim(),
        contact: contactInput.value.trim(),
        id: previous?.id || nextStudentId(),
        status: previous?.status || (mode === "edit" ? "Белсенді" : "Қосылды")
      };
      const rowIndex = editingRow ? [...list.children].indexOf(editingRow) : list.children.length;
      const row = buildStudentRow(student, rowIndex);
      if (editingRow) editingRow.replaceWith(row);
      else list.append(row);
      dialog.close();
      syncCount();
      if (search) search.dispatchEvent(new Event("input", { bubbles: true }));
      showToast(editingRow ? "Оқушы мәліметтері жаңартылды" : "Оқушы тізімге қосылды");
      editingRow = null;
    });

    form.querySelector("[data-action='add-student']")?.addEventListener("click", () => openDialog());

    list.addEventListener("click", async (event) => {
      const button = event.target.closest(".student-actions button");
      if (!button) return;
      const row = button.closest(".student-row");
      const buttons = [...button.parentElement.children];
      const action = button.dataset.action || (buttons.indexOf(button) === 0 ? "edit-student" : "delete-student");
      if (action === "edit-student") {
        openDialog(row);
        return;
      }
      const name = row.querySelector("strong")?.textContent || "Оқушы";
      if (await confirmAction(`${name} тізімнен жойылсын ба?`)) {
        row.remove();
        syncCount();
        showToast("Оқушы тізімнен жойылды", "warning");
      }
    });

    const filterStudents = () => {
      const query = normalize(search.value);
      [...list.children].forEach((row) => {
        row.hidden = Boolean(query) && !normalize(row.textContent).includes(query);
      });
    };
    ["input", "change", "search"].forEach((eventName) => search?.addEventListener(eventName, filterStudents));

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".csv,text/csv,text/plain";
    fileInput.hidden = true;
    form.append(fileInput);
    form.querySelector("[data-action='import-students']")?.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
      let added = 0;
      lines.forEach((line, index) => {
        const [rawName = "", rawContact = ""] = line.split(/[;,\t]/).map((part) => part.trim().replace(/^"|"$/g, ""));
        if (index === 0 && /аты|name/i.test(rawName) && /байланыс|нөмір|телефон|phone|contact|email/i.test(rawContact)) return;
        if (!rawName) return;
        list.append(buildStudentRow({ name: rawName, contact: rawContact, id: nextStudentId(), status: mode === "edit" ? "Белсенді" : "Қосылды" }, list.children.length));
        added += 1;
      });
      fileInput.value = "";
      syncCount();
      showToast(added ? `${added} оқушы импортталды` : "CSV файлында жарамды оқушы табылмады", added ? "success" : "warning");
    });

    syncCount();
    return { list, syncCount };
  };

  const loadEditClass = (form, roster) => {
    const id = new URLSearchParams(location.search).get("class") || "5a";
    const custom = readStorage(storageKeys.custom, []).find((item) => item.id === id);
    const edits = readStorage(storageKeys.edits, {});
    const data = custom || { ...classDefaults[id], ...(edits[id] || {}) };
    if (!data?.number) return id;

    form.querySelector("[name='class-number']").value = data.number;
    form.querySelector("[name='class-letter']").value = data.letter;
    const subject = form.querySelector("[name='class-subject']");
    if (![...subject.options].some((option) => option.value === data.subject || option.textContent === data.subject)) {
      subject.add(new Option(data.subject, data.subject));
    }
    subject.value = data.subject;

    const label = `${data.number}${data.letter} сыныбы`;
    const crumb = document.querySelector(".breadcrumb strong");
    if (crumb) crumb.textContent = label;
    document.title = `${label} — Daryn AI`;

    if (Array.isArray(data.students) && roster) {
      roster.list.replaceChildren(...data.students.map((student, index) => buildStudentRow(student, index)));
      roster.syncCount();
    }
    return id;
  };

  const setupClassForm = () => {
    const form = document.querySelector("#class-form");
    if (!form) return;
    const roster = setupRoster(form);
    const mode = form.dataset.mode;
    const editingId = mode === "edit" ? loadEditClass(form, roster) : null;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const number = form.querySelector("[name='class-number']").value.trim();
      const letter = form.querySelector("[name='class-letter']").value.trim().toLocaleUpperCase("kk-KZ");
      const subject = form.querySelector("[name='class-subject']").value;
      const students = roster ? [...roster.list.querySelectorAll(".student-row")].map(studentFromRow) : [];
      const record = { number, letter, subject, students };

      if (mode === "create") {
        const classes = readStorage(storageKeys.custom, []);
        classes.push({ id: `custom-${Date.now()}`, ...record, average: "—" });
        writeStorage(storageKeys.custom, classes);
        showToast("Сынып сәтті құрылды");
      } else {
        const classes = readStorage(storageKeys.custom, []);
        const customIndex = classes.findIndex((item) => item.id === editingId);
        if (customIndex >= 0) {
          classes[customIndex] = { ...classes[customIndex], ...record };
          writeStorage(storageKeys.custom, classes);
        } else {
          const edits = readStorage(storageKeys.edits, {});
          edits[editingId] = { ...(edits[editingId] || {}), ...record };
          writeStorage(storageKeys.edits, edits);
        }
        showToast("Өзгерістер сақталды");
      }
      setTimeout(() => { location.href = "classes.html"; }, 450);
    });
  };

  const classCardMarkup = (item) => {
    const count = item.students?.length || 0;
    const visibleStudents = (item.students || []).slice(0, 5);
    const avatars = visibleStudents.map((student, index) => `<span class="student-avatar ${avatarClasses[index % avatarClasses.length]}">${escapeHtml(initials(student.name))}</span>`).join("");
    const remaining = Math.max(0, count - visibleStudents.length);
    const remainder = remaining ? `<span class="student-avatar slate">+${remaining}</span>` : "";
    const label = `${item.number}${item.letter}`;
    return `
      <div class="class-card-head"><span class="class-mark">${escapeHtml(label)}</span><div><h2>${escapeHtml(label)} сынып</h2><p class="class-subject">${escapeHtml(item.subject)}</p></div><span class="tag tag-blue">▣ ${escapeHtml(item.number)}-сынып</span></div>
      <div class="class-metrics"><div class="class-metric"><strong>${count}</strong><span>Оқушы</span></div><div class="class-metric"><strong>${escapeHtml(item.average || "—")}</strong><span>Орташа баға</span></div></div>
      <div class="class-students-preview"><div class="avatar-stack" aria-label="Оқушылар">${avatars}${remainder}</div><a class="text-link" href="class-edit.html?class=${encodeURIComponent(item.id)}#students">◉ Тізім</a></div>
      <div class="class-card-actions"><a class="btn btn-secondary btn-sm" href="class-edit.html?class=${encodeURIComponent(item.id)}">✎ Өңдеу</a><button class="btn btn-secondary btn-sm muted" type="button" data-action="delete-class">▧ Жою</button></div>`;
  };

  const setupClassesPage = () => {
    const grid = document.querySelector(".classes-grid");
    if (!grid) return;
    const deleted = readStorage(storageKeys.deleted, []);
    deleted.forEach((id) => grid.querySelector(`[data-class-id="${CSS.escape(id)}"]`)?.remove());

    const edits = readStorage(storageKeys.edits, {});
    Object.entries(edits).forEach(([id, data]) => {
      const card = grid.querySelector(`[data-class-id="${CSS.escape(id)}"]`);
      if (!card) return;
      const label = `${data.number}${data.letter}`;
      card.querySelector(".class-mark").textContent = label;
      card.querySelector("h2").textContent = `${label} сынып`;
      card.querySelector(".class-subject").textContent = data.subject;
      card.querySelector(".class-card-head .tag").textContent = `▣ ${data.number}-сынып`;
      if (Array.isArray(data.students)) card.querySelector(".class-metric strong").textContent = data.students.length;
    });

    readStorage(storageKeys.custom, []).forEach((item) => {
      const card = document.createElement("article");
      card.className = "card class-card";
      card.dataset.classId = item.id;
      card.innerHTML = classCardMarkup(item);
      grid.append(card);
    });

    const search = document.querySelector("[data-class-search]");
    const gradeFilter = document.querySelector("[data-grade-filter]");
    const subjectFilter = document.querySelector("[data-subject-filter]");
    const noResults = document.createElement("p");
    noResults.className = "empty-filter-message";
    noResults.textContent = "Сұраныс бойынша сынып табылмады.";
    noResults.hidden = true;
    grid.after(noResults);

    const decorateCards = () => {
      grid.querySelectorAll(".class-card").forEach((card) => {
        card.dataset.search = normalize(card.textContent);
        card.dataset.grade = card.querySelector(".class-mark")?.textContent.match(/\d+/)?.[0] || "";
        card.dataset.subject = normalize(card.querySelector(".class-subject")?.textContent);
      });
    };

    const filterCards = () => {
      const query = normalize(search?.value);
      const grade = gradeFilter?.value.match(/\d+/)?.[0] || "";
      const subjectValue = subjectFilter?.value || "";
      const subject = subjectValue.startsWith("Барлық") ? "" : normalize(subjectValue);
      let visible = 0;
      grid.querySelectorAll(".class-card").forEach((card) => {
        const matches = (!query || card.dataset.search.includes(query))
          && (!grade || card.dataset.grade === grade)
          && (!subject || card.dataset.subject === subject);
        card.hidden = !matches;
        if (matches) visible += 1;
      });
      noResults.hidden = visible > 0;
    };

    const refreshStats = () => {
      const cards = [...grid.querySelectorAll(".class-card")];
      const students = cards.reduce((sum, card) => sum + Number(card.querySelector(".class-metric strong")?.textContent || 0), 0);
      const subjects = new Set(cards.map((card) => normalize(card.querySelector(".class-subject")?.textContent)).filter(Boolean));
      const stats = document.querySelectorAll(".class-stat strong");
      if (stats[0]) stats[0].textContent = cards.length;
      if (stats[1]) stats[1].textContent = students;
      if (stats[2]) stats[2].textContent = subjects.size;
    };

    [search, gradeFilter, subjectFilter].forEach((control) => {
      control?.addEventListener(control.tagName === "SELECT" ? "change" : "input", filterCards);
    });

    grid.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action='delete-class']");
      if (!button) return;
      const card = button.closest(".class-card");
      const id = card.dataset.classId;
      const name = card.querySelector("h2")?.textContent || "Сынып";
      if (!await confirmAction(`${name} жойылсын ба?`)) return;
      if (id.startsWith("custom-")) {
        writeStorage(storageKeys.custom, readStorage(storageKeys.custom, []).filter((item) => item.id !== id));
      } else {
        writeStorage(storageKeys.deleted, [...new Set([...readStorage(storageKeys.deleted, []), id])]);
      }
      card.remove();
      decorateCards();
      refreshStats();
      filterCards();
      showToast("Сынып жойылды", "warning");
    });

    decorateCards();
    refreshStats();
    filterCards();
  };

  setupClassForm();
  setupClassesPage();
})();
