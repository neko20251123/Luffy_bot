require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID; // .envに入れる（文字列）

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const morningReplies = [
  "おはよ！",
  "お、起きたか",
  "今日も来たな",
  "朝から元気だな",
];

let lastReplyAt = 0;
const COOLDOWN_MS = 60 * 1000;

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🎯 Target channel: ${TARGET_CHANNEL_ID}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (!TARGET_CHANNEL_ID) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  const now = Date.now();
  if (now - lastReplyAt < COOLDOWN_MS) return;

  if (message.content.includes("おは")) {
    lastReplyAt = now;
    message.channel.send(pick(morningReplies));
  }
});

client.login(process.env.DISCORD_TOKEN);