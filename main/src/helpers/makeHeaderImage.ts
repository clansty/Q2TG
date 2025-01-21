import { GroupRole } from '@icqqjs/icqq/lib/common';
import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
import * as fs from 'fs';

const WIDTH = 450;
const HEIGHT = 150;
const avatarSize = 110;

const drawAvatar = async (avatarPath: string) => {
  const avatarImage = await loadImage(avatarPath);
  const avatarSize = avatarImage.naturalHeight;

  const canvas = createCanvas(avatarSize, avatarSize);
  const canvasCtx = canvas.getContext('2d');

  const avatarX = 0;
  const avatarY = 0;

  canvasCtx.beginPath();
  canvasCtx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  canvasCtx.clip();
  canvasCtx.closePath();
  canvasCtx.restore();
  canvasCtx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);

  return canvas;
};

function drawTextWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, x: number, y: number) {
  // Measure the full text width
  let textWidth = ctx.measureText(text).width;

  // If text fits within the maxWidth, draw it as is
  if (textWidth <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }

  // Append ellipsis and measure
  const ellipsis = '...';
  const ellipsisWidth = ctx.measureText(ellipsis).width;

  // Reduce the text until it fits
  while (textWidth + ellipsisWidth > maxWidth && text.length > 0) {
    text = text.slice(0, -1); // Remove last character
    textWidth = ctx.measureText(text).width;
  }

  // Draw the truncated text with ellipsis
  ctx.fillText(text + ellipsis, x, y);
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y); // 起点（左上圆角右侧）

  // Top edge
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius); // 右上角

  // Right edge
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius); // 右下角

  // Bottom edge
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius); // 左下角

  // Left edge
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius); // 左上角

  ctx.closePath(); // 封闭路径
}

const makeHeaderImage = async (nameColor: string, avatarPath: string, name: string, title: string, role: GroupRole) => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const canvasCtx = canvas.getContext('2d');

  if (role !== 'member') {
  }

  const avatar = await drawAvatar(avatarPath);
  canvasCtx.drawImage(avatar, 0, 20, avatarSize, avatarSize);

  canvasCtx.fillStyle = nameColor;
  canvasCtx.font = 'bold 45px sans-serif';
  drawTextWithEllipsis(canvasCtx, name, WIDTH - avatarSize - 30, avatarSize + 15, 92);

  if (title) {
    // const width = canvasCtx.measureText(title).width;
    // canvasCtx.fillStyle = role === 'admin' ? '#2FE1D8' : '#FDCE3A';
    // drawRoundedRect(canvasCtx, avatarSize + avatarPosX * 2, 30, width, 40, 10);
    // canvasCtx.fill();

    canvasCtx.fillStyle = '#777';
    canvasCtx.font = '26px sans-serif';
    canvasCtx.fillText(title, avatarSize + 15, 40);
  }

  return canvas.createPNGStream();
};

export default makeHeaderImage;
// (async () => {
//   await makeHeaderImage(nameColorLight[0], 'E:\\Downloads\\1.png', 'Name', 'Title', 'admin')
//     .then((buffer) => {
//       fs.writeFileSync('E:\\Downloads\\header.png', buffer);
//     })
//     .catch(console.log);
// })();

