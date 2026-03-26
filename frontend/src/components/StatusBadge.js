import React from 'react';

const statusConfig = {
  pending: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-400',
    label: 'Pending',
  },
  running: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    dot: 'bg-blue-400',
    label: 'Running',
  },
  success: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-400',
    label: 'Success',
  },
  failed: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    dot: 'bg-red-400',
    label: 'Failed',
  },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${config.bg} ${config.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
