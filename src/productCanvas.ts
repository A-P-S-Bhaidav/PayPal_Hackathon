/**
 * Renders high-clarity procedural product inspection photographs onto an HTML5 Canvas
 * and exports real PNG base64 bytes so Gemini 3.5 / Groq Qwen 3.8 Vision inspects actual pixels.
 */

export type ProductPresetId =
  | 'chipped_ceramic_mug'
  | 'scratched_monitor_stand'
  | 'cracked_espresso_carafe'
  | 'synthetic_spoof_photo';

export function renderPresetProductPhotoDataUrl(presetId: ProductPresetId): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 560;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Studio dark-neutral gradient backdrop
  const bg = ctx.createLinearGradient(0, 0, 560, 360);
  bg.addColorStop(0, '#111827');
  bg.addColorStop(1, '#1f2937');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 560, 360);

  // Studio table surface
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 265, 560, 95);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 265);
  ctx.lineTo(560, 265);
  ctx.stroke();

  if (presetId === 'chipped_ceramic_mug') {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(270, 282, 92, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mug handle
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(348, 195, 42, -Math.PI / 2.2, Math.PI / 2.2);
    ctx.stroke();

    // Matte obsidian mug body
    const mugGrad = ctx.createLinearGradient(185, 110, 355, 275);
    mugGrad.addColorStop(0, '#334155');
    mugGrad.addColorStop(0.5, '#1e293b');
    mugGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = mugGrad;
    ctx.beginPath();
    ctx.roundRect(190, 115, 160, 162, [6, 6, 26, 26]);
    ctx.fill();

    // Rim ellipse
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.ellipse(270, 115, 80, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0f19';
    ctx.beginPath();
    ctx.ellipse(270, 115, 72, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Visible exposed ceramic rim chip on top-right edge
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(322, 108);
    ctx.lineTo(340, 113);
    ctx.lineTo(335, 127);
    ctx.lineTo(318, 120);
    ctx.closePath();
    ctx.fill();

    // Inspection callout ring
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(330, 117, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (presetId === 'scratched_monitor_stand') {
    // Base plate
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.roundRect(175, 255, 210, 22, 6);
    ctx.fill();

    // Anodized vertical column
    const colGrad = ctx.createLinearGradient(245, 70, 315, 255);
    colGrad.addColorStop(0, '#64748b');
    colGrad.addColorStop(0.5, '#94a3b8');
    colGrad.addColorStop(1, '#475569');
    ctx.fillStyle = colGrad;
    ctx.fillRect(245, 68, 70, 190);

    // VESA mount plate
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(225, 78, 110, 68, 8);
    ctx.fill();

    // Prominent bright silver surface scratches across column
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(255, 152);
    ctx.lineTo(306, 214);
    ctx.moveTo(262, 146);
    ctx.lineTo(309, 198);
    ctx.stroke();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(248, 140, 65, 82);
    ctx.setLineDash([]);
  } else if (presetId === 'cracked_espresso_carafe') {
    // Borosilicate glass carafe silhouette
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.75)';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(235, 95);
    ctx.lineTo(325, 95);
    ctx.lineTo(305, 155);
    ctx.lineTo(348, 255);
    ctx.lineTo(212, 255);
    ctx.lineTo(255, 155);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Branched hairline crack near collar
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(298, 132);
    ctx.lineTo(282, 165);
    ctx.lineTo(294, 192);
    ctx.moveTo(282, 165);
    ctx.lineTo(266, 182);
    ctx.stroke();

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(284, 164, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // Synthetic AI spoof grid pattern
    for (let x = 140; x < 420; x += 20) {
      for (let y = 75; y < 255; y += 20) {
        ctx.fillStyle = (x + y) % 40 === 0 ? '#7c2d12' : '#1e1b4b';
        ctx.fillRect(x, y, 18, 18);
      }
    }
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(138, 73, 284, 184);
  }

  // Clean telemetry caption strip
  ctx.fillStyle = 'rgba(7, 9, 14, 0.82)';
  ctx.fillRect(14, 14, 285, 28);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  const labels: Record<ProductPresetId, string> = {
    chipped_ceramic_mug: 'INSPECTION SAMPLE: RIM CHIP (8% AREA)',
    scratched_monitor_stand: 'INSPECTION SAMPLE: SURFACE ABRASION',
    cracked_espresso_carafe: 'INSPECTION SAMPLE: HAIRLINE FRACTURE',
    synthetic_spoof_photo: 'ADVERSARIAL SAMPLE: SYNTHETIC ARTIFACT',
  };
  ctx.fillText(labels[presetId], 24, 32);

  return canvas.toDataURL('image/png');
}
