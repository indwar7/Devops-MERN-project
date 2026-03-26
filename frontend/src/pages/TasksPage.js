import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import TaskForm from '../components/TaskForm';
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const PAGE_SIZE = 10;

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/tasks', {
        params: { page, limit: PAGE_SIZE, sort: '-createdAt' },
      });
      const data = response.data;
      setTasks(data.tasks || data || []);
      setTotalPages(data.totalPages || Math.ceil((data.total || 0) / PAGE_SIZE) || 1);
    } catch (err) {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleTaskCreated = () => {
    setPage(1);
    fetchTasks();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage and monitor your AI tasks
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          <PlusIcon className="h-4 w-4" />
          New Task
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Task list */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-gray-500">
              No tasks found. Create your first task to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden border-b border-gray-200 px-6 py-3 sm:grid sm:grid-cols-12 sm:gap-4">
              <span className="col-span-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Title
              </span>
              <span className="col-span-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Operation
              </span>
              <span className="col-span-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Status
              </span>
              <span className="col-span-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Created
              </span>
              <span className="col-span-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Updated
              </span>
            </div>

            {/* Table rows */}
            <div className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <Link
                  key={task._id || task.id}
                  to={`/tasks/${task._id || task.id}`}
                  className="block px-6 py-4 transition-colors hover:bg-gray-50 sm:grid sm:grid-cols-12 sm:items-center sm:gap-4"
                >
                  <div className="col-span-4">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {task.title}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {task.operation}
                    </span>
                  </div>
                  <div className="col-span-2 mt-1 sm:mt-0">
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="col-span-2 mt-1 sm:mt-0">
                    <span className="text-xs text-gray-500">
                      {new Date(task.createdAt || task.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="col-span-2 mt-1 sm:mt-0">
                    <span className="text-xs text-gray-500">
                      {new Date(task.updatedAt || task.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
            <p className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create task modal */}
      <TaskForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onCreated={handleTaskCreated}
      />
    </div>
  );
}
