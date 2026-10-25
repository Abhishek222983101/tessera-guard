/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import { useEffect, useState } from "react";
import HalftoneWordmarkFooter from "@/components/ui/halftone-wordmark-footer";
import { LogoMark } from "@/components/Logo";
import { useStore } from "@/lib/store";

export default function ParadigmFooter() {
  const [ff, setFf] = useState("Helvetica, Arial, sans-serif");
  const conn = useStore((s) => s.conn);
  useEffect(() => { setFf(getComputedStyle(document.body).fontFamily); }, []);
  const live = conn === "live";
  return (
    <HalftoneWordmarkFooter
      wordmark="paradigm" fontFamily={ff} monoFamily={ff} height="620px" crop={0.0}
      label="Team Paradigm"
      meta="Built TESSERA for D3COY 1.0, the DJS ISACA 24-hour cyber hackathon at DJSCE Mumbai. A real monitor watching a simulated company."
      columns={[
        { title: "Product", links: [{ label: "Start here", href: "/guide" }, { label: "Live demo", href: "/demo" }, { label: "Attack Lab", href: "/lab" }, { label: "Stolen token", href: "/hijack" }] },
        { title: "Evidence", links: [{ label: "Measured results", href: "/bench" }, { label: "Role contracts", href: "/contracts" }, { label: "Agent chains", href: "/chains" }, { label: "What's real", href: "/about" }] },
        { title: "The idea", links: [{ label: "Valid token" }, { label: "Wrong behaviour" }, { label: "Caught, explained" }, { label: "Contained, not stopped" }] },
      ]}
      status={<span className="inline-flex items-center gap-2"><LogoMark size={16} /><span className="inline-block h-2 w-2 rounded-full" style={{ background: live ? "#3fb27f" : "#f5b83d" }} />{live ? "Core live · all systems simulated" : "Core offline · recorded replay available"}</span>}
    />
  );
}
