/**
 * サイトの記事(Astro content collection)をZenn形式へ変換する。
 *
 *   node to_zenn.mjs                 # 既定の対象記事を変換
 *   node to_zenn.mjs <slug> ...      # 指定した記事だけ変換
 *
 * 出力: zenn/articles/<slug>.md
 * - published: false で出す。Zennで公開するかは人間が判断する
 * - 本文中のサイト内リンク(/blog/xxx/)は絶対URLへ書き換える
 * - 末尾に初出リンクを付ける(重複コンテンツ対策。サイト側を正とする)
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://ykstudio.net';
const SRC = path.resolve('../site/src/content/blog');
const OUT = path.resolve('./articles');

/** 記事ごとの絵文字とトピック。Zennはtopics最大5個・小文字英数 */
const META = {
  'revenuecat-silent-failure':   { emoji: '💸', topics: ['flutter', 'firebase', 'revenuecat', '個人開発'] },
  'x-autopost-19-posts-never-sent': { emoji: '📮', topics: ['playwright', 'typescript', '自動化', '個人開発'] },
  'cloud-cost-zero-yen':         { emoji: '🧾', topics: ['firebase', 'googlecloud', '個人開発'] },
  'closed-test-12-testers-14-days': { emoji: '📱', topics: ['android', 'googleplay', '個人開発'] },
  'why-ai-written-articles-feel-ai': { emoji: '✍️', topics: ['ai', 'zenn', 'ポエム'], type: 'idea' },
  'flutter-release-only-crashes': { emoji: '💥', topics: ['flutter', 'android', 'dart'] },
  'github-rename-broke-three-apps': { emoji: '🔗', topics: ['github', 'googleplay', '個人開発'] },
  'gcp-trial-to-paid-account':   { emoji: '☁️', topics: ['googlecloud', 'firebase', '個人開発'] },
  'rewarded-ads-beat-subscription': { emoji: '📺', topics: ['admob', 'flutter', '個人開発'] },
  'ffmpeg-store-promo-video':    { emoji: '🎬', topics: ['ffmpeg', 'python', '個人開発'] },
  'youtube-upload-automation-api': { emoji: '📹', topics: ['youtube', 'oauth', 'typescript', '自動化'] },
  'two-agents-one-device':       { emoji: '🤖', topics: ['ai', 'android', 'adb', '個人開発'] },
  'play-country-japan-only-trap': { emoji: '🌏', topics: ['googleplay', 'android', '個人開発'] },
  'play-screenshot-spec-trap':   { emoji: '🖼', topics: ['googleplay', 'powershell', '個人開発'] },
  'demo-video-pii-leak':         { emoji: '🕶', topics: ['ffmpeg', 'security', '個人開発'] },
  'blog-monetization-what-is-actually-required': { emoji: '💰', topics: ['adsense', 'astro', 'ポエム'], type: 'idea' },
  'ai-employees-what-actually-works': { emoji: '🧑‍💼', topics: ['ai', 'claude', 'claudecode', 'マルチエージェント', '個人開発'], type: 'idea' },
  'google-play-release-checklist-2026': { emoji: '✅', topics: ['googleplay', 'android', '個人開発'] },
  'internal-docs-were-wrong': { emoji: '📄', topics: ['ai', 'ポエム', '個人開発'], type: 'idea' },
  'places-api-caching-policy': { emoji: '🗺', topics: ['googlemaps', 'firebase', '個人開発'] },
};

const DEFAULT_TARGETS = [
  'revenuecat-silent-failure',
  'x-autopost-19-posts-never-sent',
  'cloud-cost-zero-yen',
  'why-ai-written-articles-feel-ai',
  'closed-test-12-testers-14-days',
];

const parse = (raw) => {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('frontmatterが見つかりません');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { fm, body: m[2] };
};

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : DEFAULT_TARGETS;

const available = (await readdir(SRC)).map((f) => f.replace(/\.md$/, ''));

/**
 * 記事 → アプリの対応は site/src/data/works.ts が唯一の正。ここで持たない。
 * 二重管理にすると、works.ts に記事を足したときZenn側だけ古い対応のまま残る。
 */
async function loadAppByPost() {
  const ts = await readFile(path.resolve('../site/src/data/works.ts'), 'utf8');
  const map = {};
  const re = /slug:\s*'([^']+)',[\s\S]*?name:\s*'([^']+)',[\s\S]*?posts:\s*\[([\s\S]*?)\]/g;
  for (const m of ts.matchAll(re)) {
    const [, appSlug, appName, postsRaw] = m;
    for (const p of postsRaw.matchAll(/'([^']+)'/g)) {
      // 複数アプリに載っている記事は先に書かれた方を採る（サイト側の著者ボックスと同じ規則）
      if (!map[p[1]]) map[p[1]] = { slug: appSlug, name: appName };
    }
  }
  return map;
}
const APP_BY_POST = await loadAppByPost();

/** 記事末尾の導線。初出リンク＋該当アプリ＋受託。CTAを増やしすぎると全部押されなくなる */
function footer(slug) {
  const app = APP_BY_POST[slug];
  const appLine = app
    ? `- この記事で触れているアプリ: [${app.name}](${SITE}/works/${app.slug}/)`
    : `- 作ったアプリ: [Works](${SITE}/#works)`;
  return `---

この記事は個人サイト [YK Studio](${SITE}/) に掲載したものです（初出: ${SITE}/blog/${slug}/）。
アプリ3本を個人開発して、実際に壊れた話と実際にかかった金額を書いています。

${appLine}
- アプリ開発・ストア公開のご依頼: [料金と進め方](${SITE}/services/)
`;
}

for (const slug of targets) {
  if (!available.includes(slug)) {
    console.error(`✗ 記事が見つかりません: ${slug}`);
    continue;
  }
  const { fm, body } = parse(await readFile(path.join(SRC, `${slug}.md`), 'utf8'));
  const meta = META[slug] ?? { emoji: '📝', topics: ['個人開発'] };

  const converted = body
    // サイト内リンクを絶対URLへ
    .replace(/\]\((\/blog\/[a-z0-9-]+\/)\)/g, `](${SITE}$1)`)
    .replace(/\]\((\/(?:about|privacy|services)\/)\)/g, `](${SITE}$1)`)
    .trim();

  const out = `---
title: "${fm.title.replace(/"/g, '\\"')}"
emoji: "${meta.emoji}"
type: "${meta.type ?? 'tech'}"
topics: [${meta.topics.map((t) => `"${t}"`).join(', ')}]
published: false
---

${converted}

${footer(slug)}`;

  await writeFile(path.join(OUT, `${slug}.md`), out, 'utf8');
  console.log(`✓ ${slug}.md`);
}
