import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import {
  ClockIcon,
  CpuChipIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

const statCards = [
  { key: 'total', label: 'Total Tasks', icon: DocumentTextIcon, color: 'bg-gray-100 text-gray-600' },
  { key: 'pending', label: 'Pending', icon: ClockIcon, color: 'bg-yellow-100 text-yellow-600' },
  { key: 'running', label: 'Running', icon: CpuChipIcon, color: 'bg-blue-100 text-blue-600' },
  { key: 'success', label: 'Succeeded', icon: CheckCircleIcon, color: 'bg-green-100 text-green-600' },
  { key: 'failed', label: 'Failed', icon: XCircleIcon, color: 'bg-red-100 text-red-600' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState({ total: 0, pending: 0, running: 0, success: 0, failed: 0 });
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, tasksRes] = await Promise.all([
          api.get('/tasks/stats').catch(() => null),
          api.get('/tasks', { params: { limit: 5, sort: '-createdAt' } }),
        ]);

        if (statsRes?.data) {
          setStats(statsRes.data);
        } else {
          // Compute stats from tasks if no stats endpoint
          const tasks = tasksRes.data.tasks || tasksRes.data || [];
          const computed = { total: tasks.length, pending: 0, running: 0, success: 0, failed: 0 };
          tasks.forEach((t) => {
            if (computed[t.status] !== undefined) computed[t.status]++;
          });
          setStats(computed);
        }

        setRecentTasks(tasksRes.data.tasks || tasksRes.data || []);
      } catch (err) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Overview of your AI task processing activity
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map(({ key, label, icon: Icon, color }) => (
          <div
            key={key}
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200"
          >
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats[key]}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent tasks */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Tasks</h2>
          <Link
            to="/tasks"
            className="text-sm font-medium text-primary-600 hover:text-primary-500"
          >
            View all
          </Link>
        </div>

        {recentTasks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <DocumentTextIcon className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              No tasks yet. Create your first task to get started.
            </p>
            <Link
              to="/tasks"
              className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Create Task
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentTasks.slice(0, 5).map((task) => (
              <Link
                key={task._id || task.id}
                to={`/tasks/${task._id || task.id}`}
                className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {task.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {task.operation} &middot;{' '}
                    {new Date(task.createdAt || task.created_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
