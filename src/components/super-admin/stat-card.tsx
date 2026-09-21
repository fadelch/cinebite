"use client";

import { motion, useReducedMotion } from "motion/react";

interface StatCardProps {
  label: string;
  value: number;
  detail: string;
  index: number;
  tone?: "default" | "success" | "danger";
}

const TONE_STYLES = {
  default: "bg-amber-400",
  success: "bg-emerald-400",
  danger: "bg-red-400",
};

export function StatCard({
  label,
  value,
  detail,
  index,
  tone = "default",
}: StatCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      className="cb-panel relative overflow-hidden p-5 sm:p-6"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.28,
        delay: reduceMotion ? 0 : index * 0.05,
      }}
    >
      <span
        className={`absolute inset-y-0 left-0 w-0.5 ${TONE_STYLES[tone]}`}
      />
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">
        {value}
      </p>
      <p className="mt-2 text-xs text-zinc-500">{detail}</p>
    </motion.article>
  );
}
