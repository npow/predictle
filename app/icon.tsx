import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "radial-gradient(circle at 35% 30%, #f0abfc 0%, #c026d3 55%, #7c3aed 100%)",
          borderRadius: "9999px",
        }}
      />
    ),
    { ...size }
  );
}
