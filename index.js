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
  "{name}！何やってんだおめえ！！",
  "俺の仲間になれ！！",
  "腹減った！肉だ！肉！！",
  "ゴムゴムのピストル",
  "ゴムゴムのガトリング",
  "ゴムゴムのキングコングガン",
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

  return { ok: true, sound };
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
      await interaction.editReply(`🎧 ${r.sound} を鳴らした！`);
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