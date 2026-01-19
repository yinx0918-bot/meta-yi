alert("META YI JS LOADED");
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
const LS_DIVINER = "meta_yi_diviner_name_v1";
const LS_AWAIT_NAME = "meta_yi_await_name_v1";

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

  // 基本限制
  if (!t) return false;
  if (t.length < 2) return false;
  if (t.length > 8) return false; // 名字别太长

  // 有明显句子标点、空格太多，一律不当名字
  if (/[。！？?!.，,]/.test(t)) return false;
  if (/\s/.test(t)) return false;

  // 过滤常见寒暄/无意义
  if (/^(你好|您好|在吗|在不在|嗨|哈喽|hello|hi|test|测试)$/i.test(t)) return false;

  // 允许：中文/日文/英文（短）
  // 中文/日文：2-8字；英文：2-8字母
  const isCJK = /^[\u4e00-\u9fff\u3040-\u30ff]{2,8}$/.test(t);
  const isEN  = /^[a-zA-Z]{2,8}$/.test(t);

  return isCJK || isEN;
}


  const PREF_DIVINER_NAME = "divinerName";
  const PREF_HAS_NAMED    = "hasNamed";

  const uid = () => "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const nowISO = () => new Date().toISOString();
  const safeParse = (v, f) => {
  if (v == null || v === "") return f;           // ✅ localStorage 为空时兜底
  try {
    const x = JSON.parse(v);
    return (x == null ? f : x);                  // ✅ JSON.parse(null) 会得到 null，也要兜底
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

  function getIntent(){ return getPrefs().intent || INTENTS.DIVINE; }
  function setIntent(i){ savePrefs({ intent: i }); }
  /* ===============================
   Persona Binding (Diviner Name)
=============================== */
function getDivinerName(){
  const p = getPrefs();
  return (p[PREF_DIVINER_NAME] || "").trim();
}
function hasNamedDiviner(){
  const p = getPrefs();
  return !!p[PREF_HAS_NAMED] && !!getDivinerName();
}
function setDivinerName(name){
  const n = String(name || "").trim().slice(0, 10); // 防止太长
  if (!n) return false;
  savePrefs({ [PREF_DIVINER_NAME]: n, [PREF_HAS_NAMED]: true });
  return true;
}
function clearDivinerName(){
  savePrefs({ [PREF_DIVINER_NAME]: "", [PREF_HAS_NAMED]: false });
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

    setActiveButton(mainModePanel, b => b.dataset.mainmode === intent);
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
  sidebarDock?.addEventListener("click", e => {
    e.stopPropagation();
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  overlay?.addEventListener("click", closeSidebar);

  /* ===============================
     Model Picker
  =============================== */
  function openModel(){
    modelPicker?.classList.add("open");
    modelPanel.hidden = false;
  }
  function closeModel(){
    modelPicker?.classList.remove("open");
    modelPanel.hidden = true;
  }

  modelToggle?.addEventListener("click", e => {
    e.stopPropagation();
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
if (!Array.isArray(chats)) chats = [];  // ✅ 彻底避免 null / object

  let currentId = "draft";

 const draftMessages = [
  
];

  function saveChats(){ localStorage.setItem(LS_CHATS, JSON.stringify(chats)); }
  function hasUser(chat){ return chat.messages.some(m => m.role === "user"); }
  function getChat(){ return chats.find(c => c.id === currentId); }
  function messages(){ return currentId === "draft" ? draftMessages : getChat().messages; }

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
     Engine
  =============================== */
    /* ===============================
     Divination Path Router (Auto)
     - 用户不选择，系统判定路径
     - 返回：{ mode, method, needsExternal, ask }
  =============================== */
  function chooseDivinationPath(text){
    const t = String(text || "").toLowerCase();

    // 强提示：需要“外部起卦”
    // （你说六爻/高岛/塔罗需要外部起卦配合）
    const needExternal = (methodName, ask) => ({
      mode: "EXTERNAL",
      method: methodName,
      needsExternal: true,
      ask
    });

    // 1) 塔罗：恋爱/关系/情绪/复合等，很常见
    if (/(恋爱|感情|复合|暧昧|分手|出轨|喜欢|他爱不爱|她爱不爱|关系|相处|心情|情绪)/.test(text)) {
      return needExternal("塔罗", "请你现在抽 3 张牌（过去/现在/未来）并告诉我牌名；或直接输入你抽到的三张牌。");
    }

    // 2) 六爻：事业决策/成败/能不能/要不要/签约/官非等
    if (/(能不能|可以吗|要不要|成不成|是否|签约|合同|跳槽|升职|裁员|投资|赚钱|亏|官司|纠纷|项目|合作|创业)/.test(text)) {
      return needExternal("六爻", "请用“外部起卦”：抛 3 枚硬币起卦（6 次），把每次正反结果发我；或直接发你得到的卦（本卦/变卦）。");
    }

    // 3) 择日：开业/搬家/签约/结婚/动土/出行/手术等
    if (/(择日|选日|吉日|开业|搬家|乔迁|入宅|动土|开工|签约日期|结婚|领证|出行|旅行|手术|开刀)/.test(text)) {
      return {
        mode: "DATE",
        method: "择日",
        needsExternal: false,
        ask: "请补充：①你所在城市 ②要做的事 ③可选日期范围（例如 1/20–2/5）④是否有必须避开的日子。"
      };
    }

    // 4) 默认：高島（偏“断势/断机/决断”），适合日文市场
    return needExternal("高島易断", "请你用“外部起卦”：随手翻书取一页一行（或抽签/随机数字 1–64），把得到的数字/卦名告诉我。");
  }

   async function runEngine({ intent, text }){
    await sleep(450);

    if (intent === INTENTS.LEARN) {
      return `【问答学习】\n\n问题：${text}\n\n我会按“概念 → 结构 → 方法 → 例子”回答。\n（后续接入 AI 后这里会变成真正的讲解）`;
    }

    if (intent === INTENTS.COMFORT) {
      return `【求安慰】\n\n我听到了：${text}\n\n先把心稳住：你现在最难受的点是“哪一句话/哪件事”？\n我会给你一个可执行的小步骤，让你今晚先睡稳。`;
    }

    // =========================
    // 推演占卜：系统自动判定路径
    // =========================
    const route = chooseDivinationPath(text);

    // 记录“系统判定结果”（只存内部，不对外展示 UI）
   savePrefs({ model: route.method }); // 你也可以改成 route.mode，但这里用 method 更直观

    // 需要外部起卦：先引导用户完成起卦（关键：让机器像大师一样“布置动作”）
    if (route.needsExternal) {
      return `【推演占卜｜系统判定：${route.method}】\n\n命题：${text}\n\n为确保“不是凭空说”，本题需要你完成一次外部起卦。\n\n下一步：${route.ask}\n\n你发来结果后，我再进入：定象 → 断势 → 给结论与行动建议。`;
    }

    // 不需要外部起卦的路径（例如择日）
    if (route.mode === "DATE") {
      return `【推演占卜｜系统判定：择日】\n\n命题：${text}\n\n我可以按“协纪辩方思路 + 干支避忌”给你筛选。\n\n下一步：${route.ask}`;
    }

    // 兜底（理论上走不到）
    return `【推演占卜】\n\n命题：${text}\n\n请补充一点背景，我才能开始推演。`;
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
    chat.messages.push({ role: "user", text, ts: nowISO() });
    // ===== Onboarding: Naming flow (AFTER user sends a message) =====
if (!hasNamedDiviner() || isAwaitingName()) {

  // 情况A：系统正在等用户给名字——把这一条当名字处理
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
    return; // ✅ 结束：不进入 runEngine
  }

  // 情况B：还没取名（或用户没按名字回答）——先请他取名
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
    return; // ✅ 结束：不进入 runEngine
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
      fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    message: text
  })
})
.then(res => res.json())
.then(data => {
  console.log("API RESPONSE:", data);
})
.catch(err => {
  console.error("API ERROR:", err);
});

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

  if (chats.filter(hasUser).length) currentId = chats[0].id;

  renderChatList();
  renderDialogue();
  applyModeUI();
});


