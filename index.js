const { Client, GatewayIntentBits, Events, ChannelType, Partials } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ユーザーごとの会話履歴（最大20件）
const histories = new Map();
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `あなたは「はまひるがお副官」です。Z-FLAG CG TEAMのAI副官として、オーナーのひるま克治さんをサポートします。
- 親しみやすく、頼りになる存在として振る舞う
- 日本語で自然に会話する
- 簡潔で実用的な回答を心がける
- CGプロダクション経営・映像制作に関する知識を活かす`;

client.once(Events.ClientReady, (c) => {
  console.log(`起動完了: ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === ChannelType.DM;
  const isMentioned = message.mentions.has(client.user);

  if (!isDM && !isMentioned) return;

  const userText = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!userText) return;

  const userId = message.author.id;
  if (!histories.has(userId)) histories.set(userId, []);
  const history = histories.get(userId);

  history.push({ role: 'user', content: userText });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  try {
    await message.channel.sendTyping();

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    const reply = response.content[0].text;
    history.push({ role: 'assistant', content: reply });

    // Discordの2000文字制限に対応
    if (reply.length > 2000) {
      const chunks = reply.match(/[\s\S]{1,2000}/g);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(reply);
    }
  } catch (error) {
    console.error('エラー:', error);
    await message.reply('エラーが発生しました。しばらくしてからお試しください。');
  }
});

// プロセスクラッシュ防止
process.on('unhandledRejection', (error) => {
  console.error('未処理のPromiseエラー:', error);
});

process.on('uncaughtException', (error) => {
  console.error('未処理の例外:', error);
  // 致命的なエラーの場合はプロセスを再起動させる（Railwayが自動再起動）
  process.exit(1);
});

client.login(process.env.DISCORD_TOKEN);
