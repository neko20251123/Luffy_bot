require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
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
  // --- 麦わらの一味（公式） ---
  { name: "ルフィ", amount: 3000000000 },
  { name: "ゾロ", amount: 1111000000 },
  { name: "サンジ", amount: 1032000000 },
  { name: "ジンベエ", amount: 1100000000 },
  { name: "ロビン", amount: 930000000 },
  { name: "ウソップ", amount: 500000000 },
  { name: "ナミ", amount: 366000000 },
  { name: "フランキー", amount: 394000000 },
  { name: "ブルック", amount: 383000000 },
  { name: "チョッパー", amount: 1000 },

  // --- クロスギルド（原作で提示された数値として有名） ---
  { name: "バギー", amount: 3189000000 },
  { name: "ミホーク", amount: 3590000000 },
  { name: "クロコダイル", amount: 1965000000 },

  // --- 四皇級/伝説級（原作で提示された数値として広く知られる） ---
  { name: "シャンクス", amount: 4048900000 },
  { name: "黒ひげ", amount: 3996000000 },
  { name: "カイドウ", amount: 4611100000 },
  { name: "ビッグ・マム", amount: 4388000000 },
  { name: "白ひげ", amount: 5046000000 },
  { name: "ロジャー", amount: 5564800000 },

  // --- 最悪の世代/同額枠（30億） ---
  { name: "ロー", amount: 3000000000 },
  { name: "キッド", amount: 3000000000 },

  // --- ここから“盛り上がる”中堅～有名どころ（必要なら追加していく運用） ---
  { name: "エース", amount: 550000000 },
  { name: "サボ", amount: 602000000 },
  { name: "カタクリ", amount: 1057000000 },
  { name: "キング", amount: 1390000000 },
  { name: "クイーン", amount: 1320000000 },
  { name: "ジャック", amount: 1000000000 },

  { name: "ドフラミンゴ", amount: 340000000 },
  { name: "ハンコック", amount: 1659000000 },
  { name: "バルトロメオ", amount: 200000000 },
  { name: "キャベンディッシュ", amount: 330000000 },
  { name: "サイ", amount: 210000000 },

  // “ネタ枠”を増やすならここに追加してOK
];

// 懸賞金によってセリフが変わるように定数を設定
const BOUNTY_REACTIONS = {
  "ルフィ": [
    "俺と同じ額だ！やるじゃねぇか！",
    "同格ってことにしとく！…でも負けねぇぞ！",
  ],
  "ゾロ": [
    "ゾロと同じだ！お前つええな！",
    "ゾロ級かよ…迷子のくせに強ぇからな！",
  ],
  "サンジ": [
    "サンジと同じだ！飯食って強くなれ！",
    "コック級ってことだ！腹減った！",
  ],
  "ロビン": [
    "ロビン級か…頭も強さもヤベぇぞ！",
    "…生きたいって言える顔してんな！",
  ],
  "バギー": [
    "バギーと同じ…ってマジか！？世の中わかんねぇ！",
    "運も実力のうちってやつか！",
  ],
  "ミホーク": [
    "ミホーク級！？斬られたくねぇ！！",
    "剣士でもねぇのに…やるじゃねぇか！",
  ],
  "クロコダイル": [
    "クロコダイル級か！砂より乾いてねぇな！",
    "やべぇやつってことだ！",
  ],
  "ロジャー": [
    "ロジャー級はヤバすぎだろ！！",
    "海賊王クラスだ！…勝負だ！！",
  ],
};

const BOUNTY_GENERIC = [
  "やるじゃねぇか！仲間になれ！",
];

// ====== 会話クールダウン ======
let lastReplyAt = 0;
const COOLDOWN_MS = 5 * 1000;

// ====== サウンド ======
const SOUND_DIR = path.join(__dirname, "sounds");
const soundFiles = fs.existsSync(SOUND_DIR)
  ? fs.readdirSync(SOUND_DIR).filter((f) => f.endsWith(".mp3") || f.endsWith(".wav"))
  : [];

let activePlayer = createAudioPlayer();
let soundLastAt = 0;
const SOUND_COOLDOWN_MS = 1500;

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

// 接続（常駐）
async function ensureVoiceConnected(guild) {
  const fixedVc = getFixedVoiceChannel(guild);
  if (!fixedVc) return { ok: false, reason: "固定VCが見つからねぇ！" };

  // 既に接続してるならそれを使う
  const existing = getVoiceConnection(guild.id);
  if (existing) return { ok: true, connection: existing, channel: fixedVc };

  const connection = joinVoiceChannel({
    channelId: fixedVc.id,
    guildId: fixedVc.guild.id,
    adapterCreator: fixedVc.guild.voiceAdapterCreator,
    selfDeaf: false, // botは聞こえなくていいが、falseにしておくとトラブル減りがち
  });

  // 接続安定待ち（失敗時に早期でわかる）
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    try { connection.destroy(); } catch {}
    return { ok: false, reason: "VC接続に失敗した！権限/ミュート/VC種類を確認してくれ！" };
  }

  // プレイヤー購読（常駐）
  connection.subscribe(activePlayer);

  return { ok: true, connection, channel: fixedVc };
}

// 切断
function disconnectVoice(guild) {
  const connection = getVoiceConnection(guild.id);
  if (connection) {
    try { connection.destroy(); } catch {}
    return true;
  }
  return false;
}

// 再生
async function playRandomSound(guild) {
  if (!soundFiles.length) return { ok: false, reason: "sounds/ に mp3/wav がねぇ！" };

  const now = Date.now();
  if (now - soundLastAt < SOUND_COOLDOWN_MS) {
    return { ok: false, reason: "ちょい待て！連打すんな！" };
  }
  soundLastAt = now;

  const ensure = await ensureVoiceConnected(guild);
  if (!ensure.ok) return ensure;

  const sound = pick(soundFiles);
  const resource = createAudioResource(path.join(SOUND_DIR, sound));
  activePlayer.play(resource);

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
  if (message.author.bot) return;
  if (!TARGET_CHANNEL_ID) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  const trimmed = message.content.trimStart();
  const isLuffy = trimmed.startsWith("ルフィ ") || trimmed.startsWith("ルフィ　");
  if (!isLuffy) return;

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
  await interaction.deferReply({ ephemeral: true });

  try {
    if (sub === "join") {
      const ensure = await ensureVoiceConnected(interaction.guild);
      if (!ensure.ok) {
        await interaction.editReply(`❌ ${ensure.reason}`);
        return;
      }
      await interaction.editReply("✅ 了解！固定VCに常駐した！");
      return;
    }

    if (sub === "dc") {
      const ok = disconnectVoice(interaction.guild); // ※あとでactiveConnection方式にしてもOK
      if (ok) {
        await interaction.editReply("👋 了解！固定VCから抜けた！");
      } else {
        await interaction.editReply("今はVCにいねぇぞ！");
      }
      return;
    }

    if (sub === "sound") {
      const r = await playRandomSound(interaction.guild);
      if (!r.ok) {
        await interaction.editReply(`❌ ${r.reason}`);
        return;
      }
      await interaction.editReply("🎧 ルフィがサウンドを流しました！");
      return;
    }

    if (sub === "bounty") {
      const target = interaction.options.getUser("target") ?? interaction.user;

      const entry = pick(BOUNTIES);

      // 同額キャラが複数いる場合（例：30億）に備える
      const sameNames = BOUNTIES
        .filter((b) => b.amount === entry.amount)
        .map((b) => b.name);

      const sameText =
        sameNames.length >= 2
          ? `…${sameNames.join("・")} と同じ額だな！`
          : `…${entry.name} と同じ額だな！`;

      const characterReaction =
        (BOUNTY_REACTIONS[entry.name] && pick(BOUNTY_REACTIONS[entry.name])) ||
        pick(BOUNTY_GENERIC);

      await interaction.editReply(
        `${target} お前の懸賞金は…… **${formatBerries(entry.amount)}**！！\n${sameText}\n${characterReaction}`
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

client.login(process.env.DISCORD_TOKEN);