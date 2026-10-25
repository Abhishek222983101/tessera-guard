"use client";
import { useApi } from "@/lib/useApiB";
import { mockAbout } from "@/lib/mockB";
import { PageHead, Section, SampleBadge, ErrorBox } from "@/components/ui/bits";
import { TestGuide, Pill } from "@/components/ui/kit";
import { Bot, ShieldCheck, Server, ArrowRight } from "lucide-react";

interface About { real: string[]; simulated: string[]; standards: string[] }
export default function About() {
  const { data, error, sample, reload } = useApi<About>("/about", mockAbout);
  return (
    <div>
      <PageHead title="What is real" sub="The guard is real. The company and the agents around it are test fixtures." right={sample ? <SampleBadge /> : undefined} />
      <TestGuide id="about" title="How to use this page" steps={["Read Real and Simulated.", "Follow the diagram left to right.", "Open Results for the numbers."]}
        expect="Agents are simulated, the guard is real, and every number says how it was produced." />
      {error && <div className="mb-4"><ErrorBox message={error} onRetry={reload} /></div>}
      <Section title="One action, start to finish" hint="Every tool call passes one checkpoint before it reaches any tool.">
        <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
          <Box icon={Bot} title="AI agent" body="Valid token. May have read a poisoned page." tag="simulated" />
          <ArrowRight className="mx-auto text-faint" />
          <Box icon={ShieldCheck} title="TESSERA checkpoint" body="Job description, source of each value, normal behaviour, risk, decision." tag="real" />
          <ArrowRight className="mx-auto text-faint" />
          <Box icon={Server} title="Company tools" body="Files, ERP, email, web. Reached only on a yes." tag="simulated" />
        </div>
      </Section>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Real" hint="Runs for real in this lab."><ul className="space-y-2.5">{data.real.map((r) => <li key={r} className="flex gap-2.5 text-[14.5px]"><i className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />{r}</li>)}</ul></Section>
        <Section title="Simulated" hint="Test agents obey instructions they find in documents. That is the standard way to test prompt injection, and it makes runs repeatable."><ul className="space-y-2.5">{data.simulated.map((r) => <li key={r} className="flex gap-2.5 text-[14.5px]"><i className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ice" />{r}</li>)}</ul></Section>
      </div>
      <div className="mt-4"><Section title="Standards" hint="Followed rather than invented."><div className="flex flex-wrap gap-2">{data.standards.map((s) => <Pill key={s} tone="gray">{s.split(":")[0].slice(0, 44)}</Pill>)}</div></Section></div>
    </div>
  );
}
function Box({ icon: I, title, body, tag }: { icon: typeof Bot; title: string; body: string; tag: string }) {
  return <div className="rounded-lg border border-line bg-panel2 p-4"><div className="flex items-center justify-between"><I size={20} className="text-muted" /><Pill tone={tag === "real" ? "green" : "blue"}>{tag}</Pill></div><div className="mt-3 text-[15px] font-medium">{title}</div><p className="mt-1 text-[13.5px] text-muted">{body}</p></div>;
}
