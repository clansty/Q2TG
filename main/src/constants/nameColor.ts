const colors = [
  '#FC5C51', // red
  '#FA790F', // orange
  '#895DD5', // purple
  '#0FB297', // green
  '#0FC9D6', // sea
  '#3CA5EC', // blue
  '#D54FAF', // pink
];

export default (id: number) => {
  const nameIndex = Math.abs(id) % 7;
  return colors[nameIndex];
};
