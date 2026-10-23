import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  DollarSign, Ticket, ShoppingCart, Percent, Plus, RefreshCw, 
  Calendar, MapPin, AlertCircle, CheckCircle, Edit, Users, Clock 
} from 'lucide-react';

export default function OrganizerDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Create Event Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [salesCutoffDate, setSalesCutoffDate] = useState('');
  const [status, setStatus] = useState('active');
  const [tiers, setTiers] = useState([
    { tier_name: 'General Admission', price: 50, total_quantity: 100 },
    { tier_name: 'VIP', price: 150, total_quantity: 25 },
  ]);

  const loadData = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const [analyticsRes, eventsRes] = await Promise.all([
        api.getOrganizerAnalytics(),
        api.getOrganizerEvents(),
      ]);
      setAnalytics(analyticsRes.analytics);
      setEvents(eventsRes.events || []);
    } catch (err) {
      setError(err.message || 'Failed to load organizer dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setVenue('');
    setEventDate('');
    setSalesCutoffDate('');
    setStatus('active');
    setTiers([
      { tier_name: 'General Admission', price: 50, total_quantity: 100 },
      { tier_name: 'VIP', price: 150, total_quantity: 25 },
    ]);
    setEditingEvent(null);
    setFormError('');
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (ev) => {
    setEditingEvent(ev);
    setTitle(ev.title);
    setDescription(ev.description || '');
    setVenue(ev.venue);
    // Format dates for datetime-local input
    setEventDate(ev.event_date ? new Date(ev.event_date).toISOString().slice(0, 16) : '');
    setSalesCutoffDate(ev.sales_cutoff_date ? new Date(ev.sales_cutoff_date).toISOString().slice(0, 16) : '');
    setStatus(ev.status);
    
    // Tiers
    if (ev.tickets && ev.tickets.length > 0) {
      setTiers(ev.tickets.map(t => ({
        id: t.id,
        tier_name: t.tier_name,
        price: t.price / 100,
        total_quantity: t.total_quantity,
      })));
    } else {
      setTiers([{ tier_name: 'General Admission', price: 50, total_quantity: 100 }]);
    }

    setFormError('');
    setShowCreateModal(true);
  };

  const handleAddTier = () => {
    setTiers([...tiers, { tier_name: 'New Tier', price: 50, total_quantity: 50 }]);
  };

  const handleRemoveTier = (index) => {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const handleTierChange = (index, field, value) => {
    const updated = [...tiers];
    updated[index][field] = value;
    setTiers(updated);
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!title || !venue || !eventDate || !salesCutoffDate) {
      setFormError('Title, venue, event date, and sales cutoff date are required.');
      return;
    }

    if (new Date(salesCutoffDate) > new Date(eventDate)) {
      setFormError('Sales cutoff date cannot be later than event date.');
      return;
    }

    if (tiers.length === 0) {
      setFormError('Please add at least one ticket tier.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title,
        description,
        venue,
        event_date: new Date(eventDate).toISOString(),
        sales_cutoff_date: new Date(salesCutoffDate).toISOString(),
        status,
        tickets: tiers.map(t => ({
          ...(t.id ? { id: t.id } : {}),
          tier_name: t.tier_name,
          price: Math.round(parseFloat(t.price) * 100), // convert to cents
          total_quantity: parseInt(t.total_quantity, 10),
        })),
      };

      if (editingEvent) {
        await api.updateEvent(editingEvent.id, payload);
      } else {
        await api.createEvent(payload);
      }

      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to save event');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Organizer Dashboard
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Tenant Analytics
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time sales, live inventory tracking, and revenue performance
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-xs"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Event</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Revenue */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              ${analytics.total_revenue_usd}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">
              Gross from orders
            </span>
          </div>

          {/* Tickets Sold */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Tickets Sold</span>
              <Ticket className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {analytics.tickets_sold}
            </div>
            <span className="text-[11px] text-slate-500">
              of {analytics.total_capacity} total capacity
            </span>
          </div>

          {/* Remaining Tickets */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Remaining</span>
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {analytics.remaining_tickets}
            </div>
            <span className="text-[11px] text-slate-500">
              available across events
            </span>
          </div>

          {/* Total Orders */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Orders</span>
              <ShoppingCart className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {analytics.total_orders}
            </div>
            <span className="text-[11px] text-slate-500">
              confirmed purchases
            </span>
          </div>

          {/* Ticket Conversion Rate */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Conversion</span>
              <Percent className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {analytics.conversion_rate}%
            </div>
            <span className="text-[11px] text-slate-500">
              {analytics.total_orders} of {analytics.initiated_sessions} checkouts
            </span>
          </div>
        </div>
      )}

      {/* Recharts Revenue Chart */}
      {analytics && analytics.events_breakdown && analytics.events_breakdown.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Revenue Performance by Event</h2>
              <p className="text-xs text-slate-500">
                Gross revenue in USD ($) generated across your organized events
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.events_breakdown} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="title" 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  interval={0}
                  tickFormatter={(val) => (val.length > 15 ? `${val.substring(0, 15)}...` : val)}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip 
                  formatter={(val) => [`$${Number(val).toFixed(2)}`, 'Revenue']}
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                />
                <Bar dataKey="revenue_usd" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Organizer's Managed Events Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Your Managed Events</h2>
            <p className="text-xs text-slate-500">
              Configure ticket tiers, update event dates, and monitor cutoff dates
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {events.length} Events
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">Venue & Date</th>
                <th className="py-3 px-4">Sales Cutoff</th>
                <th className="py-3 px-4">Sold / Capacity</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    No events created yet. Click "Create New Event" above to get started.
                  </td>
                </tr>
              ) : (
                events.map((ev) => {
                  const isCutoffPassed = new Date() > new Date(ev.sales_cutoff_date);
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{ev.title}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">
                          {ev.tickets?.length || 0} tier(s) configured
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <div>{ev.venue}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(ev.event_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isCutoffPassed
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isCutoffPassed ? 'Closed' : new Date(ev.sales_cutoff_date).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-800">
                        {ev.total_sold} / {ev.total_capacity}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`capitalize px-2 py-0.5 rounded text-[10px] font-bold ${
                            ev.status === 'active'
                              ? 'bg-teal-50 text-teal-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => openEditModal(ev)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                        >
                          <Edit className="w-3 h-3 text-slate-500" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Bookings Feed */}
      {analytics && analytics.recent_orders && analytics.recent_orders.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-4">Recent Confirmed Bookings</h2>
          <div className="divide-y divide-slate-100">
            {analytics.recent_orders.map((ord) => (
              <div key={ord.order_id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-slate-900">{ord.attendee_name}</span>
                  <span className="text-slate-400 ml-1">({ord.attendee_email})</span>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    {ord.quantity}x {ord.tier_name} • {ord.event_title}
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="font-extrabold text-emerald-700 text-sm">
                    +${(ord.total_amount / 100).toFixed(2)}
                  </span>
                  <div className="text-[10px] text-slate-400">
                    {new Date(ord.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 border border-slate-200 animate-in fade-in zoom-in-95">
            <h2 className="text-xl font-bold text-slate-900 mb-1">
              {editingEvent ? 'Edit Event' : 'Create New Event'}
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Configure event details, sales cutoff date, and ticket tiers.
            </p>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Event Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Neon Horizon Music Festival 2026"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Venue *
                </label>
                <input
                  type="text"
                  required
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g. Silicon Valley Arena, San Jose CA"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Event Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sales Cutoff Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={salesCutoffDate}
                    onChange={(e) => setSalesCutoffDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">
                    Reservations are prevented after this time
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows="3"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide an overview of the event..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                ></textarea>
              </div>

              {/* Ticket Tiers Configuration */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-xs font-bold text-slate-800">
                    Ticket Tiers & Capacities
                  </label>
                  <button
                    type="button"
                    onClick={handleAddTier}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    + Add Another Tier
                  </button>
                </div>

                <div className="space-y-2">
                  {tiers.map((t, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <input
                        type="text"
                        required
                        placeholder="Tier Name (e.g. VIP)"
                        value={t.tier_name}
                        onChange={(e) => handleTierChange(idx, 'tier_name', e.target.value)}
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2.5 top-2 text-slate-400 text-xs">$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          min="0"
                          placeholder="Price"
                          value={t.price}
                          onChange={(e) => handleTierChange(idx, 'price', e.target.value)}
                          className="w-full pl-6 pr-2 py-2 text-xs rounded-xl border border-slate-300"
                        />
                      </div>
                      <input
                        type="number"
                        required
                        min="1"
                        placeholder="Quantity"
                        value={t.total_quantity}
                        onChange={(e) => handleTierChange(idx, 'total_quantity', e.target.value)}
                        className="w-24 px-3 py-2 text-xs rounded-xl border border-slate-300"
                      />
                      {tiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTier(idx)}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
                >
                  {submitting ? 'Saving Event...' : editingEvent ? 'Update Event' : 'Publish Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
