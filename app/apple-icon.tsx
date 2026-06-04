import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf5ff",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 140,
            height: 140,
            borderRadius: "9999px",
            background: "radial-gradient(circle at 35% 30%, #f0abfc 0%, #c026d3 55%, #7c3aed 100%)",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
