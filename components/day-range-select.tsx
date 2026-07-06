"use client";

export const DAY_RANGE_OPTIONS = [7, 14, 30, 60, 90] as const;
export type DayRange = (typeof DAY_RANGE_OPTIONS)[number];

interface DayRangeSelectProps {
  value: number;
  onChange: (days: number) => void;
  className?: string;
}

export function DayRangeSelect({ value, onChange, className = "" }: DayRangeSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`rounded-lg border border-gray-300 bg-white py-1.5 px-2.5 text-sm text-gray-700 focus:border-farmish-500 focus:outline-none ${className}`}
      aria-label="Select time window"
    >
      {DAY_RANGE_OPTIONS.map((d) => (
        <option key={d} value={d}>
          Last {d} days
        </option>
      ))}
    </select>
  );
}
