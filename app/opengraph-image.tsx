import { ImageResponse } from "next/og";
import { tagline } from "@/lib/site";

export const alt = "Predictle — rank prediction markets by probability";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f5f3ff 0%, #fdf4ff 50%, #fffbeb 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Crystal-ball mark (CSS, no emoji font needed) */}
        <div
          style={{
            display: "flex",
            width: 150,
            height: 150,
            borderRadius: "9999px",
            background: "radial-gradient(circle at 35% 30%, #f0abfc 0%, #c026d3 55%, #7c3aed 100%)",
            boxShadow: "0 20px 60px rgba(168,85,247,0.45)",
            marginBottom: 36,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 130,
            fontWeight: 900,
            letterSpacing: -4,
            background: "linear-gradient(90deg, #7c3aed, #d946ef, #ec4899)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Predictle
        </div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 42, color: "#475569" }}>
          {tagline}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 28,
            color: "#a21caf",
            fontWeight: 600,
          }}
        >
          Endless puzzles from live Manifold markets
        </div>
      </div>
    ),
    { ...size }
  );
}
