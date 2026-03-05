(() => {
  const STACK_SIZE = 5; // current + 4 behind
  const SCALE_STEP = 0.06;
  const SCRIM_OPACITY_STEP = 0.2; // black scrim opacity per layer (0 = front, darker behind)
  // Front card at bottom-center; each card behind steps up (cascading fan)
  const STACK_BASE_Y = 90; // px below center for front card
  const STACK_Y_STEP = -48; // px per layer (negative = upward)
  const Y_OFFSETS = [0, 1, 2, 3, 4].map((i) => STACK_BASE_Y + i * STACK_Y_STEP);
  // Shift whole stack up so rearmost (top) card top edge is ~10% from top
  const STACK_SHIFT_UP_VH = 0.07; // viewport fraction: top card’s top edge ~10vh from top

  let groups = [];
  let fileQueue = [];
  let totalFiles = 0;
  let sortedCount = 0;
  let busy = false;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Setup Screen ──

  async function loadConfig() {
    try {
      const res = await fetch("/api/config");
      const config = await res.json();
      if (!config) return;
      if (config.source_folder) {
        $("#source-folder").value = config.source_folder;
      }
      if (config.groups) {
        config.groups.forEach((name, i) => {
          const input = $(`.group-name[data-index="${i}"]`);
          if (input) input.value = name;
        });
      }
    } catch {
      // no saved config
    }
  }

  function getSetupValues() {
    const source = $("#source-folder").value.trim();
    const groupNames = [];
    $$(".group-name").forEach((input) => {
      const name = input.value.trim();
      if (name) groupNames.push(name);
    });
    return { source, groups: groupNames };
  }

  async function startSession() {
    const { source, groups: groupNames } = getSetupValues();
    if (!source) {
      showError("Please enter a source folder path.");
      return;
    }
    if (groupNames.length === 0) {
      showError("Please enter at least one group name.");
      return;
    }

    $("#start-btn").disabled = true;
    $("#start-btn").textContent = "Loading…";
    hideError();

    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_folder: source, groups: groupNames }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "Failed to start session.");
        return;
      }
      groups = groupNames;
      fileQueue = data.files;
      totalFiles = data.total;
      sortedCount = 0;
      enterSortScreen();
    } catch (err) {
      showError("Could not connect to server.");
    } finally {
      $("#start-btn").disabled = false;
      $("#start-btn").textContent = "Start Sorting";
    }
  }

  function showError(msg) {
    const el = $("#setup-error");
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function hideError() {
    $("#setup-error").classList.add("hidden");
  }

  // ── Sorting Screen ──

  function enterSortScreen() {
    $("#setup-screen").classList.add("hidden");
    $("#sort-screen").classList.remove("hidden");
    $("#done-overlay").classList.add("hidden");
    buildHud();
    renderStack();
    updateCounter();
  }

  function backToSetup() {
    $("#sort-screen").classList.add("hidden");
    $("#setup-screen").classList.remove("hidden");
    $("#coverflow").innerHTML = "";
  }

  function buildHud() {
    const container = $("#floating-groups");
    container.innerHTML = "";
    groups.forEach((name, i) => {
      const el = document.createElement("div");
      el.className = "hud-group";
      el.id = `hud-g-${i}`;
      el.innerHTML = `<span class="hud-key">${i + 1}</span>${escapeHtml(name)}`;
      container.appendChild(el);
    });
  }

  function flashGroup(index) {
    const el = $(`#hud-g-${index}`);
    if (!el) return;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 400);
  }

  function updateCounter() {
    $("#counter").textContent = `${sortedCount} / ${totalFiles} sorted`;
  }

  // ── Coverflow Rendering ──

  function renderStack() {
    const container = $("#coverflow");
    container.innerHTML = "";

    const visible = fileQueue.slice(0, STACK_SIZE);
    if (visible.length === 0) {
      showDone();
      return;
    }

    // Render back-to-front so z-index stacking is correct
    for (let i = visible.length - 1; i >= 0; i--) {
      const file = visible[i];
      const el = createMediaElement(file, i);
      container.appendChild(el);
    }
    updateCounter();
  }

  function createMediaElement(file, stackIndex) {
    const wrapper = document.createElement("div");
    wrapper.className = "coverflow-item";
    wrapper.dataset.stackIndex = stackIndex;
    wrapper.dataset.filename = file.name;

    const scale = 1 - stackIndex * SCALE_STEP;
    const yOffset = Y_OFFSETS[stackIndex] || Y_OFFSETS[Y_OFFSETS.length - 1];
    const shiftUpPx = window.innerHeight * STACK_SHIFT_UP_VH;
    wrapper.style.transform = `translate(-50%, -50%) translateY(${yOffset - shiftUpPx}px) scale(${scale})`;
    wrapper.style.zIndex = STACK_SIZE - stackIndex;

    if (file.type === "video") {
      const video = document.createElement("video");
      video.src = `/media/${encodeURIComponent(file.name)}`;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      wrapper.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = `/media/${encodeURIComponent(file.name)}`;
      img.alt = file.name;
      img.draggable = false;
      wrapper.appendChild(img);
    }

    if (stackIndex > 0) {
      const scrim = document.createElement("div");
      scrim.className = "coverflow-scrim";
      scrim.style.opacity = Math.min(0.75, stackIndex * SCRIM_OPACITY_STEP);
      wrapper.appendChild(scrim);
    }

    return wrapper;
  }

  function animateSortInto(groupIndex) {
    const container = $("#coverflow");
    const front = container.querySelector('.coverflow-item[data-stack-index="0"]');
    const targetBtn = $(`#hud-g-${groupIndex}`);

    if (!front || !targetBtn) {
      fileQueue.shift();
      renderStack();
      busy = false;
      return;
    }

    const frontRect = front.getBoundingClientRect();
    const btnRect = targetBtn.getBoundingClientRect();

    const deltaX = (btnRect.left + btnRect.width / 2) - (frontRect.left + frontRect.width / 2);
    const deltaY = (btnRect.top + btnRect.height / 2) - (frontRect.top + frontRect.height / 2);

    const video = front.querySelector("video");
    if (video) video.pause();

    front.style.transition = "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s cubic-bezier(0.4, 0, 0.6, 1)";
    front.style.transform = `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px) scale(0.05)`;
    front.style.opacity = "0";

    setTimeout(() => {
      fileQueue.shift();
      renderStack();
      busy = false;
    }, 450);
  }

  // ── Sort / Undo / Skip ──

  async function sortCurrent(groupIndex) {
    if (busy || fileQueue.length === 0) return;
    busy = true;

    const file = fileQueue[0];
    const groupName = groups[groupIndex];

    flashGroup(groupIndex);

    try {
      const res = await fetch("/api/sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, group: groupName }),
      });
      if (!res.ok) {
        busy = false;
        return;
      }
      sortedCount++;
      animateSortInto(groupIndex);
    } catch {
      busy = false;
    }
  }

  async function undo() {
    if (busy) return;
    busy = true;

    try {
      const res = await fetch("/api/undo", { method: "POST" });
      if (!res.ok) {
        busy = false;
        return;
      }
      const data = await res.json();
      fileQueue.unshift({ name: data.filename, type: data.type });
      sortedCount = Math.max(0, sortedCount - 1);
      $("#done-overlay").classList.add("hidden");
      renderStack();
      busy = false;
    } catch {
      busy = false;
    }
  }

  function skip() {
    if (busy || fileQueue.length <= 1) return;
    busy = true;
    const skipped = fileQueue.shift();
    fileQueue.push(skipped);
    renderStack();
    busy = false;
  }

  // ── Done Screen ──

  function showDone() {
    $("#done-summary").textContent = `You sorted ${sortedCount} file${sortedCount !== 1 ? "s" : ""} into ${groups.length} groups.`;
    $("#done-overlay").classList.remove("hidden");
  }

  // ── Keyboard Handling ──

  function handleKey(e) {
    if ($("#setup-screen").classList.contains("hidden") === false) return;
    if ($("#done-overlay").classList.contains("hidden") === false) {
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        undo();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        backToSetup();
      }
      return;
    }

    if (e.key === "0" && groups.length >= 10) {
      e.preventDefault();
      sortCurrent(9);
      return;
    }
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9 && num <= groups.length) {
      e.preventDefault();
      sortCurrent(num - 1);
      return;
    }

    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      skip();
      return;
    }

    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      undo();
      return;
    }

    if (e.key === "x" || e.key === "X") {
      e.preventDefault();
      quitApp();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      backToSetup();
      return;
    }
  }

  // ── Folder Browser ──

  let browserPath = "~";

  function openFolderBrowser() {
    const current = $("#source-folder").value.trim();
    browserPath = current || "~";
    $("#folder-modal").classList.remove("hidden");
    loadFolder(browserPath);
  }

  function closeFolderBrowser() {
    $("#folder-modal").classList.add("hidden");
  }

  async function loadFolder(path) {
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      browserPath = data.path;

      $("#folder-path-bar").textContent = data.path;

      if (data.media_count > 0) {
        $("#folder-media-count").textContent = `${data.media_count} media file${data.media_count !== 1 ? "s" : ""} in this folder`;
        $("#folder-media-count").style.color = "var(--accent)";
      } else {
        $("#folder-media-count").textContent = "No media files in this folder";
        $("#folder-media-count").style.color = "";
      }

      const list = $("#folder-list");
      list.innerHTML = "";

      if (data.parent) {
        const parentItem = document.createElement("div");
        parentItem.className = "folder-item parent-dir";
        parentItem.innerHTML = `<span class="folder-icon">\u2190</span> Parent folder`;
        parentItem.addEventListener("click", () => loadFolder(data.parent));
        list.appendChild(parentItem);
      }

      data.dirs.forEach((dir) => {
        const item = document.createElement("div");
        item.className = "folder-item";
        item.innerHTML = `<span class="folder-icon">\uD83D\uDCC1</span>${escapeHtml(dir.name)}${dir.has_media ? '<span class="media-badge">has media</span>' : ""}`;
        item.addEventListener("click", () => loadFolder(data.path + "/" + dir.name));
        list.appendChild(item);
      });

      if (data.dirs.length === 0 && !data.parent) {
        list.innerHTML = '<div class="folder-item" style="color:var(--text-muted)">No subfolders</div>';
      }
    } catch {
      $("#folder-path-bar").textContent = "Error loading folder";
    }
  }

  function selectFolder() {
    $("#source-folder").value = browserPath;
    closeFolderBrowser();
  }

  // ── Utilities ──

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Init ──

  function quitApp() {
    $("#setup-screen").classList.add("hidden");
    $("#sort-screen").classList.add("hidden");
    $("#goodbye-overlay").classList.remove("hidden");
    fetch("/api/quit", { method: "POST" }).catch(() => {});
  }

  document.addEventListener("keydown", handleKey);
  $("#start-btn").addEventListener("click", startSession);
  $("#back-btn").addEventListener("click", backToSetup);
  $("#quit-btn-setup").addEventListener("click", quitApp);
  $("#browse-btn").addEventListener("click", openFolderBrowser);
  $("#folder-modal-close").addEventListener("click", closeFolderBrowser);
  $("#folder-cancel").addEventListener("click", closeFolderBrowser);
  $("#folder-select").addEventListener("click", selectFolder);

  $("#folder-modal").addEventListener("click", (e) => {
    if (e.target === $("#folder-modal")) closeFolderBrowser();
  });

  $("#source-folder").addEventListener("keydown", (e) => {
    if (e.key === "Enter") startSession();
  });

  loadConfig();
})();
