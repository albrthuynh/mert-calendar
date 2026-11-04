export function getCalendarColorTheme(color: string) {
  const colorChannels = [1, 3, 5].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = colorChannels[0] * 0.2126 + colorChannels[1] * 0.7152 + colorChannels[2] * 0.0722;
  const dark = (luminance + 0.05) / 0.05 < 1.05 / (luminance + 0.05);
  return { dark, foreground: dark ? "#ffffff" : "#000000" };
}
