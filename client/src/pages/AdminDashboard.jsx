import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { 
  Shield, Users, Calendar, DollarSign, RefreshCw, 
  AlertCircle, CheckCircle, Clock, XCircle, FileText 
} from 'lucide-react';

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [activeTab, setActiveTab] = useState('events'); // 'events' or 'users'

  const loadSummary = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await api.getAdminSummary();
      setSummary(res.summary);
    } catch (err) {
      setError(err.message || 'Failed to load admin summary');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleStatusChange = async (eventId, newStatus) => {
    setUpdatingId(eventId);
    try {
      await api.updateAdminEventStatus(eventId, newStatus);
      await loadSummary();
    } catch (err) {
      alert(`Failed to update status: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 animate-pulse space-y-6">
        <div className="h-8 bg-slate-200 rounded w-48"></div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Platform Administration
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              Super Admin Mode
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Global metrics, multi-tenant users directory, and event governance
          </p>
        </div>

        <button
          onClick={loadSummary}
          disabled={refreshing}
          className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-xs self-start sm:self-center"
          title="Refresh summary"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Stats Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Revenue */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Platform Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              ${summary.financials.platform_revenue_usd}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">
              Across all tenants
            </span>
          </div>

          {/* Users Breakdown */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Registered Users</span>
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {summary.users.total}
            </div>
            <span className="text-[11px] text-slate-500">
              {summary.users.organizers} Org • {summary.users.attendees} Att • {summary.users.admins} Adm
            </span>
          </div>

          {/* Events Breakdown */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Events Hosted</span>
              <Calendar className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {summary.events.total}
            </div>
            <span className="text-[11px] text-slate-500">
              {summary.events.active} active • {summary.events.draft} draft
            </span>
          </div>

          {/* Ticket Sales */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Tickets Sold</span>
              <CheckCircle className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {summary.financials.total_tickets_sold}
            </div>
            <span className="text-[11px] text-slate-500">
              of {summary.financials.total_capacity} total capacity
            </span>
          </div>
        </div>
      )}

      {/* Tabs for Events vs Users */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('events')}
          className={`pb-3 transition border-b-2 ${
            activeTab === 'events'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Manage All Events ({summary?.events?.list?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 transition border-b-2 ${
            activeTab === 'users'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          All Users Directory ({summary?.users?.list?.length || 0})
        </button>
      </div>

      {/* Events Table */}
      {activeTab === 'events' && summary && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Event & Organizer</th>
                  <th className="py-3 px-4">Venue & Date</th>
                  <th className="py-3 px-4">Cutoff Date</th>
                  <th className="py-3 px-4">Sold / Capacity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.events.list.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{ev.title}</div>
                      <div className="text-[11px] text-slate-500">
                        by {ev.organizer_name} ({ev.organizer_email})
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <div>{ev.venue}</div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(ev.event_date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {new Date(ev.sales_cutoff_date).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium">
                      {ev.sold_quantity} / {ev.total_capacity}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`capitalize px-2 py-0.5 rounded text-[10px] font-bold ${
                          ev.status === 'active'
                            ? 'bg-teal-50 text-teal-700'
                            : ev.status === 'cancelled'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {ev.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      {ev.status !== 'active' && (
                        <button
                          disabled={updatingId === ev.id}
                          onClick={() => handleStatusChange(ev.id, 'active')}
                          className="px-2 py-1 rounded border border-teal-300 text-teal-700 hover:bg-teal-50 transition text-[11px]"
                        >
                          Activate
                        </button>
                      )}
                      {ev.status !== 'cancelled' && (
                        <button
                          disabled={updatingId === ev.id}
                          onClick={() => handleStatusChange(ev.id, 'cancelled')}
                          className="px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 transition text-[11px]"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users Directory Table */}
      {activeTab === 'users' && summary && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.users.list.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{u.name}</td>
                    <td className="py-3.5 px-4 text-slate-600 font-mono">{u.email}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`capitalize px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'admin'
                            ? 'bg-rose-100 text-rose-800'
                            : u.role === 'organizer'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
