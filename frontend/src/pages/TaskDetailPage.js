import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import {
  ArrowLeftIcon,
  PlayIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

export default function TaskDetailPage() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const fetchTask = useCallback(async () => {
    try {
      const response = await api.get(`/tasks/${id}`);
      setTask(response.data.task || response.data);
      setError('');
    } catch (err) {
      setError('Failed to load task details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Auto-refresh every 5 seconds when task is pending or running
  useEffect(() => {
    if (!task || (task.status !== 'pending' && task.status !== 'running')) {
      return;
    }

    const interval = setInterval(() => {
      fetchTask();
    }, 5000);

    return () => clearInterval(interval);
  }, [task, fetchTask]);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    try {
      const response = await api.post(`/tasks/${id}/run`);
      setTask(response.data.task || response.data);
    } catch (err) {
      setError(
        err.response?.data?.message || err.response?.data?.error || 'Failed to run task.'
      );
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!task && error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <Link
          to="/tasks"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-500"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Tasks
        </Link>
      </div>
    );
  }

  const logs = task?.logs || [];
  const canRun = task?.status === 'pending' || task?.status === 'failed';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        to="/tasks"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Tasks
      </Link>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Header card */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-xl font-bold text-gray-900">
                {task.title}
              </h1>
              <StatusBadge status={task.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <span>
                Operation:{' '}
                <span className="font-medium text-gray-700">
                  {task.operation}
                </span>
              </span>
              <span>
                Created:{' '}
                <span className="font-medium text-gray-700">
                  {new Date(task.createdAt || task.created_at).toLocaleString()}
                </span>
              </span>
              {(task.updatedAt || task.updated_at) && (
                <span>
                  Updated:{' '}
                  <span className="font-medium text-gray-700">
                    {new Date(task.updatedAt || task.updated_at).toLocaleString()}
                  </span>
                </span>
              )}
            </div>
          </div>

          {canRun && (
            <button
              onClick={handleRun}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Running...
                </>
              ) : (
                <>
                  <PlayIcon className="h-4 w-4" />
                  Run Task
                </>
              )}
            </button>
          )}

          {task.status === 'running' && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              Processing...
            </div>
          )}
        </div>
      </div>

      {/* Input section */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Input
        </h2>
        <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-800">
          {task.input_text || task.inputText || 'No input provided.'}
        </pre>
      </div>

      {/* Result section */}
      {(task.result || task.output) && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Result
          </h2>
          <pre className="whitespace-pre-wrap rounded-lg bg-green-50 p-4 text-sm text-gray-800">
            {task.result || task.output}
          </pre>
        </div>
      )}

      {/* Error section */}
      {task.error && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-red-500">
            Error
          </h2>
          <pre className="whitespace-pre-wrap rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {task.error}
          </pre>
        </div>
      )}

      {/* Logs timeline */}
      {logs.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Logs
          </h2>
          <div className="relative">
            <div className="absolute left-3 top-0 h-full w-0.5 bg-gray-200" />
            <ul className="space-y-4">
              {logs.map((log, index) => (
                <li key={index} className="relative flex gap-4 pl-8">
                  <div className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-primary-500 shadow" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">{log.message || log}</p>
                    {log.timestamp && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                        <ClockIcon className="h-3 w-3" />
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
