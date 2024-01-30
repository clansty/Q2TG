import random from '../utils/random';

export default {
  picture: () => random.pick('🎆', '🌃', '🌇', '🎇', '🌌', '🌠', '🌅', '🌉', '🏞', '🌆', '🌄', '🖼', '🗾', '🎑', '🏙', '🌁'),
  color(index: number) {
    const arr = [...new Intl.Segmenter().segment('🔴🟠🟡🟢🔵🟣⚫️⚪️🟤')].map(x => x.segment);
    index = index % arr.length;
    return arr[index];
  },
};
