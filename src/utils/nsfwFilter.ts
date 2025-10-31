/**
 * NSFW content filtering utilities
 */

// Blocked pubkeys (hex format) - users who consistently post NSFW content
const BLOCKED_PUBKEYS = [
  '2b14efa5b01b30dbcbecb2b8353904c45fcfafda4fee4177abcba93ac55dd76f', // npub19v2wlfdsrvcdhjlvk2ur2wgyc30ult76flhyzaatew5n432a6ahs6ptsgt
];

// Common NSFW words and phrases (keeping it minimal and professional)
const NSFW_WORDS = [
  // English terms
  'nsfw',
  "🔞",
  'topless',
  'explicit',
  'adult',
  'SexytoGirl',
  'porn',
  'xxx',
  'nude',
  'nudes',
  'naked',
  'sex',
  'sexual',
  'erotic',
  'mature',
  '18+',
  'onlyfans',
  'strip',
  'fetish',
  'kinky',
  'bdsm',
  'cam',
  'webcam',
  'escort',
  'hookup',
  'milf',
  'dilf',
  'boobs',
  'tits',
  'ass',
  'pussy',
  'dick',
  'cock',
  'penis',
  'vagina',
  'orgasm',
  'masturbat',
  'blowjob',
  'handjob',
  'cumshot',
  'threesome',
  'gangbang',
  'anal',
  'oral',
  'horny',
  'slut',
  'slutty',
  'whore',
  'bitch',
  'gonewild',

  // Chinese terms
  '色情', // sè qíng - erotic/pornographic
  '成人', // chéng rén - adult
  '裸体', // luǒ tǐ - nude/naked
  '性爱', // xìng ài - sex
  '色狼', // sè láng - pervert
  '淫秽', // yín huì - obscene
  '情色', // qíng sè - erotic
  '春药', // chūn yào - aphrodisiac
  '性感', // xìng gǎn - sexy
  '艳照', // yàn zhào - sexy photo
  '性交', // xìng jiāo - sexual intercourse
  '做爱', // zuò ài - make love/have sex
  '高潮', // gāo cháo - orgasm
  '阴茎', // yīn jīng - penis
  '阴道', // yīn dào - vagina
  '乳房', // rǔ fáng - breasts
  '屁股', // pì gu - buttocks/ass
  '自慰', // zì wèi - masturbation
  '性欲', // xìng yù - sexual desire
  '淫荡', // yín dàng - lewd
  '嫖娼', // piáo chāng - prostitution
  '卖淫', // mài yín - prostitution
  '妓女', // jì nǚ - prostitute

  // Japanese terms
  'セックス', // sekkusu - sex
  'ポルノ', // poruno - porn
  'アダルト', // adaruto - adult
  'ヌード', // nūdo - nude
  'エロ', // ero - erotic
  '痴漢', // chikan - molester
  '変態', // hentai - pervert
  '淫乱', // inran - lewd/lewdness
  '精液', // seieki - semen
  'フェラ', // fera - blowjob
  '手コキ', // tekoki - handjob
  'アナル', // anaru - anal
  '乳首', // chikubi - nipple
  '陰毛', // inmō - pubic hair
  '射精', // shasei - ejaculation
  'オナニー', // onanī - masturbation
  '童貞', // dōtei - virgin
  '売春', // baishun - prostitution
  '風俗', // fūzoku - sex industry
  '援交', // enjō - compensated dating
  'パイパン', // paipan - shaved pubic area
  '巨乳', // kyonyū - big breasts
  '貧乳', // hinnyū - small breasts
];

/**
 * Check if content contains NSFW hashtags
 */
export function hasNsfwHashtags(tags: string[][]): boolean {
  if (!Array.isArray(tags)) return false;
  
  const hashtags = tags
    .filter(tag => Array.isArray(tag) && tag[0] === 't')
    .map(tag => tag[1]?.toLowerCase())
    .filter(Boolean);
    
  return hashtags.some(tag => 
    tag === 'nsfw' || 
    tag === 'adult' || 
    tag === 'explicit' ||
    tag === '18+'
  );
}

/**
 * Check if content contains NSFW words
 */
export function hasNsfwContent(content: string): boolean {
  if (!content || typeof content !== 'string') return false;
  
  const normalizedContent = content.toLowerCase();
  
  return NSFW_WORDS.some(word => {
    // Check for whole word matches to avoid false positives
    // Use a more flexible boundary pattern that handles special characters
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-zA-Z0-9])${escapedWord}([^a-zA-Z0-9]|$)`, 'i');
    return regex.test(normalizedContent);
  });
}

/**
 * Check if a pubkey is in the blocked list
 */
export function isBlockedPubkey(pubkey: string | undefined): boolean {
  if (!pubkey) return false;
  return BLOCKED_PUBKEYS.includes(pubkey.toLowerCase());
}

/**
 * Check if a note should be filtered out due to NSFW content or blocked pubkey
 */
export function isNsfwNote(note: { content: string; tags: string[][]; pubkey?: string }): boolean {
  // Check if pubkey is blocked
  if (note.pubkey && isBlockedPubkey(note.pubkey)) {
    return true;
  }
  
  // Check for NSFW content
  return hasNsfwHashtags(note.tags) || hasNsfwContent(note.content);
}


