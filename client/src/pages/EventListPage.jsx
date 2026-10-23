import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Search, Calendar, MapPin, Ticket, Clock, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';

export default function EventListPage({ onSelectEvent }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getEvents({ search: searchTerm });
      setEvents(res.events || []);
    } catch (err) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchEvents();
    }, 250);
    return () => clearTimeout(debounce);
  }, [searchTerm]);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatPrice = (cents) => {
    return (cents / 100).toFixed(2);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 text-white p-8 sm:p-12 shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-500/30 text-teal-300 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>High-Concurrency Multi-Tenant Platform</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Discover Live Events & Reserve Exclusive Tickets
          </h1>
          <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
            Experience our atomic 10-minute reservation hold system powered by PostgreSQL row-level locks and asynchronous payment simulation.
          </p>

          {/* Search Box */}
          <div className="mt-6 relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by event title, venue, or keyword..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md text-white placeholder-slate-400 border border-white/20 focus:outline-none focus:ring-2 focus:ring-teal-400 text-sm transition"
            />
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Events Grid Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Upcoming Live Events</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time ticket inventory synced with Upstash Redis cache
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          {events.length} {events.length === 1 ? 'Event' : 'Events'} available
        </span>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse space-y-4">
              <div className="h-6 bg-slate-200 rounded-md w-3/4"></div>
              <div className="h-4 bg-slate-100 rounded-md w-1/2"></div>
              <div className="h-16 bg-slate-100 rounded-md"></div>
              <div className="h-8 bg-slate-200 rounded-md w-full"></div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8">
          <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-800">No events found</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
            {searchTerm ? `No results matching "${searchTerm}". Try a different keyword.` : 'No upcoming events currently scheduled.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((ev) => {
            const isCutoffPassed = new Date() > new Date(ev.sales_cutoff_date);
            const totalAvail = parseInt(ev.total_available, 10);
            const isSoldOut = totalAvail <= 0;

            return (
              <div
                key={ev.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-teal-400 shadow-sm hover:shadow-lg transition flex flex-col justify-between overflow-hidden group"
              >
                <div className="p-6">
                  {/* Status & Availability badge */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-100">
                      by {ev.organizer_name}
                    </span>
                    {isCutoffPassed ? (
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        Sales Closed
                      </span>
                    ) : isSoldOut ? (
                      <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                        Sold Out
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {totalAvail} Available
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-700 transition line-clamp-1">
                    {ev.title}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                    {ev.description || 'No description provided.'}
                  </p>

                  {/* Details metadata */}
                  <div className="mt-4 space-y-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                      <span>{formatDate(ev.event_date)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                      <span className="truncate">{ev.venue}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <span>Cutoff: {new Date(ev.sales_cutoff_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Footer with Price and Reserve Button */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                      Price from
                    </span>
                    <span className="text-base font-extrabold text-slate-900">
                      ${formatPrice(ev.min_price)}
                      {ev.min_price !== ev.max_price && (
                        <span className="text-xs font-normal text-slate-500 ml-1">
                          - ${formatPrice(ev.max_price)}
                        </span>
                      )}
                    </span>
                  </div>

                  <button
                    onClick={() => onSelectEvent(ev.id)}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition group-hover:shadow-md"
                  >
                    <span>View Tickets</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
