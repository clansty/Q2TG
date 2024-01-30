import random from '../utils/random';

export default {
  picture: () => random.pick('🎆', '🌃', '🌇', '🎇', '🌌', '🌠', '🌅', '🌉', '🏞', '🌆', '🌄', '🖼', '🗾', '🎑', '🏙', '🌁'),
  color(index: number) {
    const arr = [...'🔴🟠🟡🟢🔵🟣⚫️⚪️🟤'];
    index = index % arr.length;
    return arr[index];
  },
};
