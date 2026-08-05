import { ImageResponse } from 'next/og';

// O iOS usa o apple-touch-icon ao adicionar o site a tela de inicio. Ele nao
// aceita SVG bem, entao geramos um PNG aqui em vez de manter um binario no repo.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #15151d 0%, #0b0b0f 100%)',
          color: '#fff',
          fontSize: 84,
          fontWeight: 700,
          letterSpacing: -4,
        }}
      >
        <span style={{ color: '#25f4ee' }}>A</span>
        <span style={{ color: '#fe2c55' }}>T</span>
      </div>
    ),
    size,
  );
}
