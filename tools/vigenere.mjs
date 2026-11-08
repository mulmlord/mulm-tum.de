// Classic Vigenère: shifts letters only, keeps case and everything else, and the
// key advances only on letters (the same convention CyberChef and dcode.fr use).
export function vigenere(text, key, { decrypt = false } = {}) {
  const k = key.toLowerCase().replace(/[^a-z]/g, '');
  if (!k) throw new Error('Vigenère key needs at least one letter');
  let i = 0;
  return text.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    const shift = (k.charCodeAt(i++ % k.length) - 97) * (decrypt ? -1 : 1);
    return String.fromCharCode(((ch.charCodeAt(0) - base + shift + 26) % 26) + base);
  });
}
