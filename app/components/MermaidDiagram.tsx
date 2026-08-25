"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// Initialize mermaid client-side
if (typeof window !== "undefined") {
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
    fontFamily: "Inter, sans-serif",
  });
}

interface MermaidDiagramProps {
  chart: string;
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    // Generate a unique ID for the mermaid parser
    const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

    const renderChart = async () => {
      try {
        setError(null);
        const { svg: renderedSvg } = await mermaid.render(uniqueId, chart);
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err) {
        console.error("Error rendering mermaid chart:", err);
        if (isMounted) {
          setError("Error al renderizar el diagrama.");
        }
        // Attempt to clean up mermaid's temporary container if it fails
        const badElem = document.getElementById(uniqueId);
        if (badElem) {
          badElem.remove();
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div 
        className="mermaid-error" 
        style={{
          border: "1px dashed var(--accent)",
          padding: "1rem",
          borderRadius: "8px",
          color: "var(--accent)",
          fontSize: "0.85rem",
          background: "rgba(255, 51, 102, 0.05)",
          margin: "8px 0",
        }}
      >
        ⚠️ {error}
        <pre style={{ marginTop: "8px", fontSize: "0.75rem", whiteSpace: "pre-wrap", opacity: 0.8 }}>
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="mermaid-diagram flex justify-center"
      style={{
        background: "#0d0d14",
        border: "1px solid var(--card-border)",
        borderRadius: "8px",
        padding: "1rem",
        overflowX: "auto",
        margin: "8px 0",
        display: "flex",
        justifyContent: "center",
      }}
      dangerouslySetInnerHTML={{ 
        __html: svg || '<div class="text-muted" style="font-size: 0.85rem; padding: 0.5rem;">Renderizando diagrama...</div>' 
      }}
    />
  );
}
