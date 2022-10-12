const TGS = ['打call', '流泪', '变形', '比心', '庆祝', '鞭炮'];
export default {
  getTgsIndex(message: string) {
    const index1 = TGS.map(text => `[${text}]请使用最新版手机QQ体验新功能`).indexOf(message);
    if (index1 > -1) {
      return index1;
    }
    return TGS.map(text => `/${text}`).indexOf(message);
  },
};
