export function stripDecorativeIcons(content: string) {
  return content.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/^[ \t]+/gm, '');
}
