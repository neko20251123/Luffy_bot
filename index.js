const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
let isConnected = false;
let emptyTimer = null;
const EMPTY_TIMEOUT = 60 * 1000; // 1分

const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} = require("@discordjs/voice");

const fs = require("fs");
const path = require("path");

const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const LUFFY_VOICE_CHANNEL_ID = process.env.LUFFY_VOICE_CHANNEL_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
});

// 読み上げロジック
const TTS_TMP = path.join(__dirname, "tts.wav");

function sanitizeTtsText(s) {
  return (s ?? "")
    .replace(/https?:\/\/\S+/g, "URL")
    .replace(/<@!?(\d+)>/g, "メンション")
    .replace(/<#[0-9]+>/g, "チャンネル")
    .trim()
    .slice(0, 120);
}

const { spawn } = require("node:child_process");

function runOpenJtalk(text) {
  return new Promise((resolve, reject) => {
    const openjtalk = spawn("open_jtalk", [
      "-x", "/var/lib/mecab/dic/open-jtalk/naist-jdic",
      "-m", "/usr/share/hts-voice/nitech-jp-atr503-m001/nitech_jp_atr503_m001.htsvoice",
      "-ow", TTS_TMP
    ]);

    openjtalk.stdin.write(text);
    openjtalk.stdin.end();

    openjtalk.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("open_jtalk exited with code " + code));
    });

    openjtalk.on("error", reject);
  });
}

let ttsQueue = Promise.resolve();

async function speakLight(text, guild) {
  const t = sanitizeTtsText(text);
  if (!t) return;

  ttsQueue = ttsQueue
    .then(async () => {
      // ✅ 常駐してないなら読まない
      if (!isConnected) return;

      const ensure = await ensureVoiceConnected(guild);
      if (!ensure.ok) return;

      // ✅ 前の再生が終わってから次へ（tts.wav上書き事故防止）
      await waitPlayerIdle();

      await runOpenJtalk(t);

      const resource = createAudioResource(TTS_TMP, {
        inputType: StreamType.Arbitrary,
      });

      ttsPlayer.play(resource);

      // ✅ この再生が終わるまで待つ
      await waitPlayerIdle();
    })
    .catch((e) => {
      console.error("❌ TTS error:", e?.message ?? e);
    });

  return ttsQueue;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ====== セリフ ======
const luffyReplies = [
  "おれは海賊王になる男だ！！",
  "船から降りろ",
  "本音を言え！！",
  "何やってんだおめえ！！",
  "俺の仲間になれ！！",
  "腹減った！肉だ！肉！！",
  "船から降りろ",
  "生きたいって言ってみろ！！",
  "何言ってんだお前",

  "お前の望みはなんだ！！",
  "一人で決めるな！！",
  "ここに立て！！",
  "顔を上げろ！！",
  "お前は必要だ！！",
  "立て！！まだ終わってねぇ！！",
  "逃げる理由なんかねぇだろ！！",
  "腹くくれ！！",
  "笑え！！それでいい！！",

  "俺の仲間になれ！！",
  "お前は一人じゃねぇ！！",
  "お前はここにいろ！！",
  "置いていくわけねぇだろ！！",

  "黙ってついてこい！！",
  "信じるって決めたんだ！！",
  "それがお前の答えか！！",
  "泣くな！！前を向け！！",
  "拳で語れ！！",

  "俺は止まらねぇ！！",
  "邪魔するならぶっ飛ばす！！",
  "覚悟決めろ！！",
  "ここからだ！！",
  "行くぞ！！",

  "助けが必要なら呼べ！！",
  "仲間を泣かせるやつは許さねぇ！！",
  "それでも進むんだ！！",
  "お前の居場所はここだ！！",
  "俺がいる！！",

  "飯食ったか！？",
  "腹減ってんだろ！？",
  "まずは肉だ！！",
  "細けぇこと考えるな！！",
  "ワクワクする方を選べ！！",

  "約束は守る！！",
  "信じた仲間は裏切らねぇ！！",
  "お前は間違ってねぇ！！",
  "笑って終わろうぜ！！",
  "次は俺の番だ！！",

  "ゴムゴムのピストル",
  "ゴムゴムのロケット",
  "ゴムゴムのバズーカ",
  "ゴムゴムのガトリング",
  "ゴムゴムのライフル",
  "ゴムゴムの鞭（ウィップ）",
  "ゴムゴムの風船（フウセン）",
  "ゴムゴムの鐘（カネ）",
  "ゴムゴムの斧（オノ）",
  "ゴムゴムの槍（ヤリ）",
  "ゴムゴムの網（アミ）",
  "ゴムゴムのコングガン",
  "ゴムゴムのコング・ガトリング",
  "ゴムゴムのレオバズーカ",
  "ゴムゴムのライノシュナイダー",
  "ゴムゴムのカルバリン",
  "ゴムゴムのキングコブラ",
  "ゴムゴムのキングコングガン",
  "ゴムゴムのレオレックス・バズーカ",
];

// ====== 懸賞金データ（実在額ベース） ======
const BOUNTIES = [
  // ====== 原作・公式枠（canon） ======
  // 麦わら
  { name: "ルフィ", amount: 3000000000, isMeme: false },
  { name: "ゾロ", amount: 1111000000, isMeme: false },
  { name: "サンジ", amount: 1032000000, isMeme: false },
  { name: "ジンベエ", amount: 1100000000, isMeme: false },
  { name: "ロビン", amount: 930000000, isMeme: false },
  { name: "ウソップ", amount: 500000000, isMeme: false },
  { name: "フランキー", amount: 394000000, isMeme: false },
  { name: "ブルック", amount: 383000000, isMeme: false },
  { name: "ナミ", amount: 366000000, isMeme: false },
  { name: "チョッパー", amount: 1000, isMeme: false },

  // クロスギルド（数字は有名な提示）
  { name: "バギー", amount: 3189000000, isMeme: false },
  { name: "ミホーク", amount: 3590000000, isMeme: false },
  { name: "クロコダイル", amount: 1965000000, isMeme: false }, //  [oai_citation:2‡ワンピースウィキ](https://onepiece.fandom.com/wiki/Chapter_1058?utm_source=chatgpt.com)

  // 四皇・伝説級（有名な提示）
  { name: "シャンクス", amount: 4048900000, isMeme: false },
  { name: "黒ひげ", amount: 3996000000, isMeme: false },
  { name: "カイドウ", amount: 4611100000, isMeme: false },
  { name: "ビッグ・マム", amount: 4388000000, isMeme: false },
  { name: "白ひげ", amount: 5046000000, isMeme: false },
  { name: "ロジャー", amount: 5564800000, isMeme: false }, //  [oai_citation:3‡ONE Esports](https://www.oneesports.gg/anime/highest-one-piece-bounties/?utm_source=chatgpt.com)

  // 最悪の世代（同額枠）
  { name: "ロー", amount: 3000000000, isMeme: false },
  { name: "キッド", amount: 3000000000, isMeme: false },

  // 中堅〜人気どころ（あなたの手持ち）
  { name: "エース", amount: 550000000, isMeme: false },
  { name: "サボ", amount: 602000000, isMeme: false },
  { name: "カタクリ", amount: 1057000000, isMeme: false },
  { name: "キング", amount: 1390000000, isMeme: false },
  { name: "クイーン", amount: 1320000000, isMeme: false },
  { name: "ジャック", amount: 1000000000, isMeme: false },
  { name: "ドフラミンゴ", amount: 340000000, isMeme: false },

  // 追加：ハンコック（有名な提示）
  { name: "ハンコック", amount: 1659000000, isMeme: false }, //  [oai_citation:4‡ワンピースウィキ](https://onepiece.fandom.com/wiki/Boa_Hancock?utm_source=chatgpt.com)


// “ネタ枠”を増やすならここに追加してOK
{ name: "偽ルフィ", amount: 26000000, isMeme: true },
{ name: "偽ゾロ", amount: 15000000, isMeme: true },
{ name: "偽ナミ", amount: 8000000, isMeme: true },
{ name: "アルビダ（初期）", amount: 5000000, isMeme: true },
{ name: "モーガン", amount: 16000000, isMeme: true },
{ name: "バギー（東の海時代）", amount: 15000000, isMeme: true },
{ name: "クロ（東の海）", amount: 16000000, isMeme: true },
{ name: "ドン・クリーク", amount: 17000000, isMeme: true },
{ name: "ワポル（初期）", amount: 10000000, isMeme: true },
{ name: "フォクシー", amount: 24000000, isMeme: true },
{ name: "スパンダム", amount: 100, isMeme: true },
{ name: "海軍の雑兵", amount: 500, isMeme: true },
];

// 懸賞金によってセリフが変わるように定数を設定
const BOUNTY_REACTIONS = {
  "ルフィ": [
    "俺と同じ額だ！やるじゃねぇか！",
    "同格ってことにしとく！…でも負けねぇぞ！",
    "30億！？ワクワクする！！",
  ],
  "ゾロ": [
    "ゾロ級かよ！お前つええな！！",
    "迷子のくせに強ぇからな…お前もヤベぇ！",
  ],
  "サンジ": [
    "コック級ってことだ！腹減った！！",
    "飯食って強くなれ！肉も食え！！",
  ],
  "ジンベエ": [
    "ジンベエと同じか！でけぇ背中してんな！！",
    "頼れるやつの額だ！！",
  ],
  "ロビン": [
    "ロビン級か…頭も強さもヤベぇぞ！",
    "…生きたいって言える顔してんな！",
  ],
  "ウソップ": [
    "ウソップと同じ！？…嘘だろ！？",
    "その額、ハッタリじゃねぇよな！？",
  ],
  "ナミ": [
    "ナミと同じだ！金の匂いがする！！",
    "その額、無駄遣いすんなよ！！",
  ],
  "フランキー": [
    "フランキーと同じ！SUPERってやつか！！",
    "改造したくなる額だな！！",
  ],
  "ブルック": [
    "ブルックと同じ！？骨のくせにやる！！",
    "ヨホホ…じゃねぇ！強ぇってことだ！！",
  ],
  "チョッパー": [
    "1000！？チョッパーかよ！！",
    "可愛さで稼いでんのか！？",
  ],
  "バギー": [
    "バギーと同じ…ってマジか！？世の中わかんねぇ！",
    "運も実力のうちってやつか！！",
  ],
  "ミホーク": [
    "ミホーク級！？斬られたくねぇ！！",
    "剣士でもねぇのに…やるじゃねぇか！",
  ],
  "クロコダイル": [
    "クロコダイル級か！やべぇやつだ！！",
    "砂みてぇに乾いた顔してんじゃねぇぞ！！",
  ],
  "シャンクス": [
    "シャンクス級！？…笑ってる場合じゃねぇ！！",
    "赤髪と同格とか…ヤバすぎだろ！！",
  ],
  "黒ひげ": [
    "黒ひげ級！？笑ってるやつは信用できねぇ！！",
    "ヤな予感しかしねぇ額だ…！",
  ],
  "カイドウ": [
    "カイドウ級！？化け物かよ！！",
    "その額…正面からぶつかりてぇ！！",
  ],
  "ビッグ・マム": [
    "ビッグ・マム級！？腹の底から強ぇな！！",
    "その額…食われんなよ！！",
  ],
  "白ひげ": [
    "白ひげ級…背中がデカすぎるだろ！！",
    "伝説ってやつか！！",
  ],
  "ロジャー": [
    "ロジャー級はヤバすぎだろ！！",
    "海賊王クラスだ！…勝負だ！！",
  ],
  "ロー": [
    "ローと同じ30億！？クールな顔して強ぇな！！",
    "医者でも海賊でも、強ぇやつは強ぇ！！",
  ],
  "キッド": [
    "キッドと同じ30億！？ケンカ腰で強ぇってことだ！！",
    "ぶっ壊し系の匂いがする！！",
  ],
  "エース": [
    "エースと同じ！？熱いじゃねぇか！！",
    "守りたい背中がある顔してる！！",
  ],
  "サボ": [
    "サボと同じ！？燃えてんな！！",
    "その額…革命の匂いがする！！",
  ],
  "カタクリ": [
    "カタクリ級！？逃げねぇやつの額だ！！",
    "強ぇのに真面目…手強い！！",
  ],
  "キング": [
    "キング級！？空から落ちてきそうだな！！",
    "その額…燃えてる！！",
  ],
  "クイーン": [
    "クイーン級！？クセ強ぇのに強ぇって最悪だ！！",
    "その額…妙にムカつく強さだな！！",
  ],
  "ジャック": [
    "ジャックと同じ10億！？十分ヤベぇ！！",
    "その額、簡単に背負えねぇぞ！！",
  ],
  "ドフラミンゴ": [
    "ドフラミンゴ級…笑ってるやつは危ねぇ！！",
    "その額…嫌な強さだ！！",
  ],
  "ハンコック": [
    "ハンコック級！？石にされんなよ！！",
    "その額…近寄りがてぇ強さだ！！",
  ],
};

const BOUNTY_GENERIC = [
  "やるじゃねぇか！仲間になれ！",
  "おもしれぇ額だな！！",
  "ワクワクしてきた！！",
  "いいじゃねぇか！！",
  "強ぇやつの匂いがする！！",
  "その額、守りきれよ！！",
  "俺と戦ってみるか！？",
  "覚悟決めろよ！！",
  "海に出る準備はできてんのか！？",
  "逃げんなよ！！",
  "その額にビビってねぇよな！？",
  "悪くねぇ！！気に入った！！",
  "腹減ってねぇか！？まずは肉だ！！",
  "その顔、強ぇやつの顔してるぞ！！",
  "まだ上がる気だろ！？",
  "へへっ…悪くねぇな！！",
  "その程度で止まるなよ！！",
  "もっと上、目指せ！！",
  "お前ならやれる！！",
  "海は広いぞ！！行くか！？",
];

// ====== 会話クールダウン ======
let lastReplyAt = 0;
const COOLDOWN_MS = 5 * 1000;

// ====== サウンド ======
const SOUND_DIR = path.join(__dirname, "sounds");
const soundFiles = fs.existsSync(SOUND_DIR)
  ? fs.readdirSync(SOUND_DIR).filter((f) => f.endsWith(".mp3") || f.endsWith(".wav"))
  : [];

let sePlayer = createAudioPlayer();
let ttsPlayer = createAudioPlayer();

// 互換のため（既存コードが activePlayer を参照してるので）
// いったんSEは sePlayer、TTSは ttsPlayer を使うように下で直す

async function waitPlayerIdle(timeoutMs = 30_000) {
  try {
    if (ttsPlayer.state.status === AudioPlayerStatus.Idle) return;
    await entersState(ttsPlayer, AudioPlayerStatus.Idle, timeoutMs);
  } catch {
    console.log("⚠️ waitPlayerIdle timeout/failed");
  }
}
let lastGuildForPlayer = null;

sePlayer.on("stateChange", (oldState, newState) =>  {
  console.log("🎵 state:", oldState.status, "→", newState.status);

  // 再生終了
  if (newState.status === AudioPlayerStatus.Idle) {
    const guild = lastGuildForPlayer;
    if (!guild) return;

    const humans = countHumansInFixedVc(guild);
    const connection = getVoiceConnection(guild.id);

    // 人がいない & 接続が残ってるなら抜ける
    if (humans === 0 && connection) {
      console.log("🧹 sound再生終了 & 無人なので退出");
      disconnectVoice(guild);
    } else {
      console.log("✅ 再生終了だが人がいる or 接続なし → 維持");
    }
  }
});
sePlayer.on("error", (err) => {
  console.error("❌ AudioPlayer error:", err?.message ?? err);
  console.error(err);
});
let soundLastAt = 0;
const SOUND_COOLDOWN_MS = 1500;

// ==========================
// コマンド実行者がVCにいるかチェック
// 実行者がチャンネルに上がってないとコマンド仕様不可にするため
// ==========================
function isInvokerInFixedVc(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;

  const fixedVc = getFixedVoiceChannel(guild);
  if (!fixedVc) return false;

  const member = interaction.member; // GuildMember
  const userChannelId = member?.voice?.channelId;

  return userChannelId === fixedVc.id;
}

// 固定VC取得
function getFixedVoiceChannel(guild) {
  const vc = guild.channels.cache.get(LUFFY_VOICE_CHANNEL_ID);
  if (!vc || !vc.isVoiceBased()) return null;
  return vc;
}

// 懸賞金を加工
function formatBerries(n) {
  const oku = Math.floor(n / 100000000);
  const man = Math.floor((n % 100000000) / 10000);
  if (oku > 0) return `${oku}億${man.toString().padStart(4, "0")}万ベリー`;
  if (man > 0) return `${man}万ベリー`;
  return `${n}ベリー`;
}

async function ensureVoiceConnected(guild) {
  const fixedVc = getFixedVoiceChannel(guild);
  if (!fixedVc) return { ok: false, reason: "固定VCが見つからねぇ！" };

  console.log("🎙 fixedVc:", fixedVc.name, "type:", fixedVc.type);

  // 既に接続してるならそれを使う
  const existing = getVoiceConnection(guild.id);
  if (existing) return { ok: true, connection: existing, channel: fixedVc };

  const connection = joinVoiceChannel({
    channelId: fixedVc.id,
    guildId: fixedVc.guild.id,
    adapterCreator: fixedVc.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  // ★ connection 作った「後」にイベントを貼る
  connection.on("error", (err) => {
    console.error("❌ VoiceConnection error:", err?.message ?? err);
    console.error(err);
  });

connection.once("stateChange", (oldState, newState) => {
  console.log("🔌 vc state:", oldState.status, "→", newState.status);
});

  // 接続安定待ち
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    try { connection.destroy(); } catch {}
    return { ok: false, reason: "VC接続に失敗した！権限/ミュート/VC種類を確認してくれ！" };
  }

connection.subscribe(sePlayer);
connection.subscribe(ttsPlayer);  return { ok: true, connection, channel: fixedVc };
}

// 切断
function disconnectVoice(guild) {
  const connection = getVoiceConnection(guild.id);
  if (connection) {
    try { connection.destroy(); } catch {}

    isConnected = false;
    console.log("🔴 常駐モード終了");

    cancelAutoDisconnect(); // ここでタイマー停止が一番安全

    return true;
  }
  return false;
}

// 再生
async function playRandomSound(guild) {
  if (!soundFiles.length) {
    console.log("❌ sounds/ にファイルが無い");
    return { ok: false, reason: "sounds/ に mp3/wav がねぇ！" };
  }

  const now = Date.now();
  if (now - soundLastAt < SOUND_COOLDOWN_MS) {
    console.log("⏳ クールダウン中");
    return { ok: false, reason: "ちょい待て！連打すんな！" };
  }
  soundLastAt = now;

  const ensure = await ensureVoiceConnected(guild);
  if (!ensure.ok) {
    console.log("❌ VC接続失敗:", ensure.reason);
    return ensure;
  }

  const sound = pick(soundFiles);
  console.log("🔊 picked:", sound);

  const filePath = path.join(SOUND_DIR, sound);
  console.log("📁 path:", filePath);

  const resource = createAudioResource(filePath, {
    inputType: StreamType.Arbitrary,
  });

lastGuildForPlayer = guild;

sePlayer.play(resource);
console.log("🎧 play() called");

  return { ok: true };
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🎯 Chat channel: ${TARGET_CHANNEL_ID}`);
  console.log(`🔊 Fixed VC: ${LUFFY_VOICE_CHANNEL_ID}`);
  console.log(`🎧 sounds: ${soundFiles.length} files`);
});

// ==========================
// 🗣 会話（通常チャット）
// ==========================
client.on("messageCreate", async (message) => {
  console.log("📩 message:", message.content);
  if (message.author.bot) return;

  // ✅ 「固定VCのテキストチャット」だけ読み上げ
  // （VCチャットの channelId は LUFFY_VOICE_CHANNEL_ID になる想定）
  if (message.channel.id === LUFFY_VOICE_CHANNEL_ID) {
    if (isConnected) {
      await speakLight(message.content, message.guild);
    }
  }

  // ここから下は、今まで通り「ルフィ 〜」会話は TARGET_CHANNEL_ID だけ等
  if (!TARGET_CHANNEL_ID) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  const trimmed = message.content.trim();
  if (!trimmed.startsWith("ルフィ")) return;

  const now = Date.now();
  if (now - lastReplyAt < COOLDOWN_MS) return;
  lastReplyAt = now;

  const userMention = `<@${message.author.id}>`;
  const displayName = message.member?.displayName ?? message.author.username;
  const line = pick(luffyReplies).replaceAll("{name}", displayName);

  await message.channel.send(`${userMention} ${line}`);
});

// ==========================
// 🔊 /ルフィ join / sound / dc
// ==========================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "ルフィ") return;

  let sub;
  try {
    sub = interaction.options.getSubcommand();
  } catch {
    return;
  }

  // ★最重要：先に受理（これで「応答しませんでした」を防ぐ）
  await interaction.deferReply();

  try {
    if (sub === "join") {
      if (!isInvokerInFixedVc(interaction)) {
        await interaction.editReply("❌ お前、固定VC（ラウンジ）に入ってから呼べ！");
        return;
      }

      const ensure = await ensureVoiceConnected(interaction.guild);
      if (!ensure.ok) {
        await interaction.editReply(`❌ ${ensure.reason}`);
        return;
      }

      // 🟢 常駐モード開始は join 成功時だけ
      isConnected = true;
      console.log("🟢 常駐モード開始");

      // ✅ joinしたらランダムSEを1回鳴らす（失敗してもjoin自体は成功扱い）
      try {
        const r = await playRandomSound(interaction.guild);
        if (!r.ok) console.log("⚠️ join時サウンド失敗:", r.reason);
      } catch (e) {
        console.log("⚠️ join時サウンド例外:", e);
      }

      // ★ 無人ならタイマー開始
      cancelAutoDisconnect(); // 念のためリセット
      const humans = countHumansInFixedVc(interaction.guild);
      if (humans === 0) {
        scheduleAutoDisconnect(interaction.guild);
      }

      await interaction.editReply("✅ 了解！固定VCに常駐した！");
      return;
    }

    if (sub === "dc") {
      if (!isInvokerInFixedVc(interaction)) {
        await interaction.editReply("❌ お前、固定VC（ラウンジ）に入ってから呼べ！");
        return;
      }
      const ok = disconnectVoice(interaction.guild); // ※あとでactiveConnection方式にしてもOK
      if (ok) {
        await interaction.editReply("👋 了解！固定VCから抜けた！");
      } else {
        await interaction.editReply("今はVCにいねぇぞ！");
      }
      return;
    }

    if (sub === "sound") {
      if (!isInvokerInFixedVc(interaction)) {
        await interaction.editReply("❌ 固定VC（ラウンジ）にいる時だけ鳴らせるぞ！");
        return;
      }

      const r = await playRandomSound(interaction.guild);
      if (!r.ok) {
        await interaction.editReply(`❌ ${r.reason}`);
        return;
      }

      // 再生成功後のみチェック
      const humans = countHumansInFixedVc(interaction.guild);
      if (humans === 0) {
        scheduleAutoDisconnect(interaction.guild);
      }

      await interaction.editReply("🎧 ルフィがサウンドを流しました！");
      return;
    }

    if (sub === "bounty") {
      const target = interaction.options.getUser("target") ?? interaction.user;
      const entry = pick(BOUNTIES);
      const formatted = formatBerries(entry.amount);

      const reaction =
        (BOUNTY_REACTIONS[entry.name] && pick(BOUNTY_REACTIONS[entry.name])) ||
        pick(BOUNTY_GENERIC);

      await interaction.editReply(
        `🏴‍☠️ 【懸賞金発表】\n` +
        `${target} の懸賞金は…… **${formatted}**！！\n` +
        ` ${entry.name}と同じだ\n` +
        `${reaction}`
      );
      return;
    }

    await interaction.editReply("そのサブコマンドは知らねぇ！");
  } catch (err) {
    console.error("interaction error:", err);
    // ここで落とさず必ず返信する
    try {
      await interaction.editReply("❌ なんかエラー出た！ターミナル見てくれ！");
    } catch {}
  }
});

// ==========================
// 👥 VC 無人監視（1分で自動退出）
// ==========================
function countHumansInFixedVc(guild) {
  const vc = getFixedVoiceChannel(guild);
  if (!vc) return 0;

  // bot以外の人数を数える
  return vc.members.filter((m) => !m.user.bot).size;
}

function scheduleAutoDisconnect(guild) {
  if (!isConnected) return; // 常駐してないなら何もしない
  if (emptyTimer) return;   // すでにタイマーあるなら二重に作らない

  emptyTimer = setTimeout(() => {
    emptyTimer = null;

    const humans = countHumansInFixedVc(guild);
    const connection = getVoiceConnection(guild.id);

    if (humans === 0 && isConnected && connection) {
      console.log("⏱ 無人が続いたので自動退出する");
      disconnectVoice(guild);
    } else {
      console.log("✅ 誰か戻った or 接続なし → 自動退出キャンセル扱い");
    }
  }, EMPTY_TIMEOUT);

  console.log(`⏳ 無人タイマー開始（${EMPTY_TIMEOUT / 1000}s）`);
}

function cancelAutoDisconnect() {
  if (!emptyTimer) return;
  clearTimeout(emptyTimer);
  emptyTimer = null;
  console.log("✅ 無人タイマー解除");
}

client.on("voiceStateUpdate", (oldState, newState) => {
  if (!isConnected) return; // ★ 常駐中だけ監視

  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;

  const fixedVc = getFixedVoiceChannel(guild);
  if (!fixedVc) return;

  const beforeId = oldState.channelId;
  const afterId = newState.channelId;

  const touchedFixed =
    beforeId === fixedVc.id || afterId === fixedVc.id;

  if (!touchedFixed) return;

  const humans = countHumansInFixedVc(guild);
  console.log(`👥 fixedVC humans: ${humans}`);

  if (humans === 0) {
    scheduleAutoDisconnect(guild);
  } else {
    cancelAutoDisconnect();
  }
});

client.login(process.env.DISCORD_TOKEN);