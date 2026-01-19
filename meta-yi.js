// =======================================================
// META YI · Stable Chat Core (Hidden Divine Paths)
// - Sub models are NOT exposed to UI
// - Divine path inferred from dialogue (like a real diviner)
// =======================================================

document.addEventListener("DOMContentLoaded", () => {

  /* ===============================
     DOM
  =============================== */
  const sidebar      = document.getElementById("sidebar");
  const sidebarDock  = document.getElementById("sidebarDock");
  const overlay      = document.getElementById("overlay");

  const chatListEl = document.getElementById("chatList");
  const newChatBtn = document.getElementById("newChat");

  const dialogue = document.getElementById("dialogue");
  const composer = document.getElementById("composer");
  const promptEl = document.getElementById("prompt");

  const modelPicker = document.getElementById("modelPicker");
  const modelToggle = document.getElementById("modelToggle");
  const modelPanel  = document.getElementById("modelPanel");

  const modelMode   = document.getElementById("modelMode");
  const modelSub    = document.getElementById("modelSub");

  const mainModePanel = document.getElementById("mainModePanel");

  if (!dialogue || !composer || !promptEl) return;

  /* ===============================
     Utils / Storage
  =============================== */
  const LS_CHATS = "meta_yi_chats_v1";
  const LS_PREFS = "meta_yi_prefs_v1";

  // ===== Diviner Naming (Onboarding) =====
  const LS_DIVINER      = "meta_yi_diviner_name_v1";
  const LS_AWAIT_NAME   = "meta_yi_await_name_v1";
  const LS_NAME_STAGE   = "meta_yi_name_stage_v1";       // ✅ missing
  const LS_NAME_CANDIDATE = "meta_yi_name_candidate_v1"; // ✅ missing

  function hasNamedDiviner(){
    return !!String(localStorage.getItem(LS_DIVINER) || "").trim();
  }
  function getDivinerName(){
    return String(localStorage.getItem(LS_DIVINER) || "").trim();
  }
  function setDivinerName(name){
    localStorage.setItem(LS_DIVINER, String(name || "").trim());
  }
  function isAwaitingName(){
    return localStorage.getItem(LS_AWAIT_NAME) === "1";
  }
  function setAwaitingName(on){
    localStorage.setItem(LS_AWAIT_NAME, on ? "1" : "0");
  }

  function getNameStage(){ return localStorage.getItem(LS_NAME_STAGE) || "0"; }
  function setNameStage(s){ localStorage.setItem(LS_NAME_STAGE, String(s)); }

  function setNameCandidate(name){
    localStorage.setItem(LS_NAME_CANDIDATE, String(name || "").trim());
  }
  function getNameCandidate(){
    return String(localStorage.getItem(LS_NAME_CANDIDATE) || "").trim();
  }
  function clearNameCandidate(){
    localStorage.removeItem(LS_NAME_CANDIDATE);
  }

  function isConfirmYes(text){
    return /^(确定|确认|是|好|ok|OK|Okay|yes|y|はい|うん)$/i.test(String(text||"").trim());
  }
  function isConfirmNo(text){
    return /^(换一个|重来|不是|不|no|n|いいえ)$/i.test(String(text||"").trim());
  }

  // “像不像名字”的粗判：尽量宽松，避免用户一句长文也被当名字
  function looksLikeName(s){
    const t = String(s || "").trim();

    if (!t) return false;
    if (t.length < 2) return false;
    if (t.length > 8) return false;

    if (/[。！？?!.，,]/.test(t)) return false;
    if (/\s/.test(t)) return false;

    if (/^(你好|您好|在吗|在不在|嗨|哈喽|hello|hi|test|测试)$/i.test(t)) return false;

    const isCJK = /^[\u4e00-\u9fff\u3040-\u30ff]{2,8}$/.test(t);
    const isEN  = /^[a-zA-Z]{2,8}$/.test(t);

    return isCJK || isEN;
  }

  const uid = () => "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const nowISO = () => new Date().toISOString();

  const safeParse = (v, f) => {
    if (v == null || v === "") return f;
    try {
      const x = JSON.parse(v);
      return (x == null ? f : x);
    } catch {
      return f;
    }
  };

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  const isMobile = () => window.innerWidth <= 720;

  function getPrefs(){ return safeParse(localStorage.getItem(LS_PREFS), {}) || {}; }
  function savePrefs(p){ localStorage.setItem(LS_PREFS, JSON.stringify({ ...getPrefs(), ...p })); }

  /* ===============================
     Intent
  =============================== */
  const INTENTS = {
    DIVINE: "DIVINE",
    LEARN: "LEARN",
    COMFORT: "COMFORT"
  };

  function normalizeIntent(v){
    const s = String(v || "").trim().toUpperCase();
    return (s === INTENTS.LEARN || s === INTENTS.COMFORT || s === INTENTS.DIVINE)
      ? s
      : INTENTS.DIVINE;
  }

  function getIntent(){
    return normalizeIntent(getPrefs().intent || INTENTS.DIVINE);
  }

  function setIntent(i){
    savePrefs({ intent: normalizeIntent(i) });
  }

  function intentLabel(i){
    if (i === INTENTS.LEARN) return "问答学习";
    if (i === INTENTS.COMFORT) return "求安慰";
    return "推演占卜";
  }

  /* ===============================
     UI Sync (NO sub-model exposure)
  =============================== */
  function setActiveButton(container, pred){
    if (!container) return;
    container.querySelectorAll("button").forEach(b => {
      b.classList.toggle("is-active", pred(b));
    });
  }

  function applyModeUI(){
    const intent = getIntent();

    if (modelMode) modelMode.textContent = intentLabel(intent);
    if (modelSub) {
      modelSub.textContent =
        intent === INTENTS.DIVINE
          ? "推演占卜 · 由系统判定路径"
          : intent === INTENTS.LEARN
            ? "只讲原理与方法"
            : "调心 · 安定 · 建议";
    }

    // ✅ 小修：dataset 可能是 learn/comfort/divine（小写），这里统一 normalize 后对比
    setActiveButton(mainModePanel, b => normalizeIntent(b.dataset.mainmode) === intent);
  }

  /* ===============================
     Sidebar
  =============================== */
  function openSidebar(){
    sidebar?.classList.add("open");
    if (overlay && isMobile()) overlay.classList.add("show");
  }
  function closeSidebar(){
    sidebar?.classList.remove("open");
    overlay?.classList.remove("show");
  }

  // ✅ FIX: sidebar 可能为 null 时，避免 sidebar.classList 报错
  sidebarDock?.addEventListener("click", e => {
    e.stopPropagation();
    if (!sidebar) return;
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });

  overlay?.addEventListener("click", closeSidebar);

  /* ===============================
     Model Picker
  =============================== */
  function openModel(){
    modelPicker?.classList.add("open");
    if (modelPanel) modelPanel.hidden = false;
  }
  function closeModel(){
    modelPicker?.classList.remove("open");
    if (modelPanel) modelPanel.hidden = true;
  }

  // ✅ FIX: modelPicker 可能为 null 时，避免 modelPicker.classList 报错
  modelToggle?.addEventListener("click", e => {
    e.stopPropagation();
    if (!modelPicker) return;
    modelPicker.classList.contains("open") ? closeModel() : openModel();
  });

  modelPanel?.addEventListener("click", e => e.stopPropagation());

  mainModePanel?.querySelectorAll("button[data-mainmode]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      setIntent(btn.dataset.mainmode);
      applyModeUI();
      closeModel();
    });
  });

  /* ===============================
     Chat Storage
  =============================== */
  let chats = safeParse(localStorage.getItem(LS_CHATS), []);
  if (!Array.isArray(chats)) chats = [];

  let currentId = "draft";

  // ✅ 按你要求：新聊天不自动说话
  const draftMessages = [];

  function saveChats(){ localStorage.setItem(LS_CHATS, JSON.stringify(chats)); }
  function hasUser(chat){ return (chat.messages || []).some(m => m.role === "user"); }
  function getChat(){ return chats.find(c => c.id === currentId); }
  function messages(){
    if (currentId === "draft") return draftMessages;
    const c = getChat();
    return c ? c.messages : draftMessages;
  }

  /* ===============================
     Render
  =============================== */
  function renderDialogue(){
    dialogue.innerHTML = "";
    messages().forEach(m => {
      const row = document.createElement("div");
      row.className = `msg msg--${m.role}`;
      const b = document.createElement("div");
      b.className = "bubble";
      b.textContent = m.text;
      row.appendChild(b);
      dialogue.appendChild(row);
    });
    dialogue.scrollTop = dialogue.scrollHeight;
  }

  function renderChatList(){
    if (!chatListEl) return;
    chatListEl.innerHTML = "";
    chats.filter(hasUser).forEach(chat => {
      const btn = document.createElement("button");
      btn.className = "sbItem";
      btn.textContent = chat.title || "未命名";
      btn.onclick = () => {
        currentId = chat.id;
        renderChatList();
        renderDialogue();
      };
      chatListEl.appendChild(btn);
    });
  }

  /* ===============================
     Divine Path Inference (CORE)
  =============================== */
  function inferDivinePath(text){
    if (/感情|复合|关系|对方/.test(text)) return "TAKASHIMA";
    if (/选择|要不要|能不能|是否/.test(text)) return "FU_XI";
    return "AUTO";
  }

  /* ===============================
     Divination Path Router (Auto)
  =============================== */
  function chooseDivinationPath(text){
    const needExternal = (methodName, ask) => ({
      mode: "EXTERNAL",
      method: methodName,
      needsExternal: true,
      ask
    });

    if (/(恋爱|感情|复合|暧昧|分手|出轨|喜欢|他爱不爱|她爱不爱|关系|相处|心情|情绪)/.test(text)) {
      return needExternal("塔罗", "请你现在抽 3 张牌（过去/现在/未来）并告诉我牌名；或直接输入你抽到的三张牌。");
    }

    if (/(能不能|可以吗|要不要|成不成|是否|签约|合同|跳槽|升职|裁员|投资|赚钱|亏|官司|纠纷|项目|合作|创业)/.test(text)) {
      return needExternal("六爻", "请用“外部起卦”：抛 3 枚硬币起卦（6 次），把每次正反结果发我；或直接发你得到的卦（本卦/变卦）。");
    }

    if (/(择日|选日|吉日|开业|搬家|乔迁|入宅|动土|开工|签约日期|结婚|领证|出行|旅行|手术|开刀)/.test(text)) {
      return {
        mode: "DATE",
        method: "择日",
        needsExternal: false,
        ask: "请补充：①你所在城市 ②要做的事 ③可选日期范围（例如 1/20–2/5）④是否有必须避开的日子。"
      };
    }

    return needExternal("高島易断", "请你用“外部起卦”：随手翻书取一页一行（或抽签/随机数字 1–64），把得到的数字/卦名告诉我。");
  }

  /* ===============================
     Engine
  =============================== */
  async function runEngine({ intent, text }){
    await sleep(450);

    console.log("[AI] sending /api/chat", { text, intent });

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, intent })
    });

    console.log("[AI] status:", res.status);

    const raw = await res.text();
    console.log("[AI] raw response:", raw);

    let data = null;
    try { data = JSON.parse(raw); } catch {}

    if (!res.ok) {
      return `【系统错误】AI 接口异常（${res.status}）\n\n${raw.slice(0, 300)}`;
    }

    return (data && (data.reply || data.text || data.message || data.content)) || raw || "【系统】AI 无返回";
  }

  /* ===============================
     Composer
  =============================== */
  function autosize(){
    promptEl.style.height = "auto";
    promptEl.style.height = Math.min(promptEl.scrollHeight, 160) + "px";
  }
  promptEl.addEventListener("input", autosize);

  composer.addEventListener("submit", e => {
    e.preventDefault();
    const text = promptEl.value.trim();
    if (!text) return;

    if (currentId === "draft") {
      const id = uid();
      chats.unshift({ id, title: text.slice(0, 14), messages: [...draftMessages] });
      currentId = id;
    }

    const chat = getChat();
    if (!chat) return;

    chat.messages.push({ role: "user", text, ts: nowISO() });

    // ===== Onboarding: Naming flow (AFTER user sends a message) =====
    if (!hasNamedDiviner() || isAwaitingName()) {

      if (isAwaitingName() && looksLikeName(text)) {
        const picked = text.trim();
        setDivinerName(picked);
        setAwaitingName(false);

        chat.messages.push({
          role: "ai",
          text:
            `好。\n从现在起，我就是你的私人占卜师「${picked}」。\n\n你想看哪一件事？（一句话说清：人/事/时间点）`,
          ts: nowISO()
        });

        saveChats();
        renderChatList();
        renderDialogue();
        promptEl.value = "";
        autosize();
        return;
      }

      if (!hasNamedDiviner()) {
        setAwaitingName(true);

        chat.messages.push({
          role: "ai",
          text:
            "我先不急着推演。\n\n在开始之前，你可以为我取一个名字吗？\n以后我就用这个名字，只做你的私人占卜师。\n\n（直接回复你想叫我的名字即可）",
          ts: nowISO()
        });

        saveChats();
        renderChatList();
        renderDialogue();
        promptEl.value = "";
        autosize();
        return;
      }
    }

    promptEl.value = "";
    autosize();
    saveChats();
    renderChatList();
    renderDialogue();

    const tmp = { role: "ai", text: "正在推演…", _tmp: true };
    chat.messages.push(tmp);
    renderDialogue();

    runEngine({ intent: getIntent(), text }).then(reply => {
      chat.messages = chat.messages.filter(m => !m._tmp);
      chat.messages.push({ role: "ai", text: reply, ts: nowISO() });
      saveChats();
      renderDialogue();
    }).catch(err => {
      console.error("ENGINE ERROR:", err);
      chat.messages = chat.messages.filter(m => !m._tmp);
      chat.messages.push({ role: "ai", text: "引擎错误，请稍后再试。", ts: nowISO() });
      saveChats();
      renderDialogue();
    });
  });

  newChatBtn?.addEventListener("click", () => {
    currentId = "draft";
    renderDialogue();
    renderChatList();
  });

  /* ===============================
     Boot
  =============================== */
  if (!getPrefs().intent) savePrefs({ intent: INTENTS.DIVINE });

  // ✅ 这行语法没问题，但我不主动替你改逻辑（按你要求）
  if (chats.filter(hasUser).length) currentId = chats[0].id;

  renderChatList();
  renderDialogue();
  applyModeUI();
});
