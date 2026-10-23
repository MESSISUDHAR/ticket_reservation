import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Calendar, MapPin, Clock, ArrowLeft, Ticket, ShieldCheck, 
  AlertCircle, CheckCircle, Plus, Minus, Lock, Sparkles 
} from 'lucide-react';

export default function EventDetailPage({ eventId, onBack, onReservationCreated, onOpenAuth }) {
  const { user, setActiveReservation } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reservationError, setReservationError] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [submittingTierId, setSubmittingTierId] = useState(null);

  const fetchEvent = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getEvent(eventId);
      setEvent(res.event);

      // Initialize quantities to 1
      const initialQty = {};
      (res.event.tickets || []).forEach(t => {
        initialQty[t.id] = 1;
      });
      setQuantities(initialQty);
    } catch (err) {
      setError(err.message || 'Failed to load event details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchEvent();
    }
  }, [eventId]);

  const updateQuantity = (tierId, delta, maxAvailable) => {
    setQuantities(prev => {
      const current = prev[tierId] || 1;
      const next = Math.max(1, Math.min(current + delta, maxAvailable));
      return { ...prev, [tierId]: next };
    });
  };

  const handleReserve = async (ticket) => {
    if (!user) {
      onOpenAuth();
      return;
    }

    setReservationError(null);
    setSubmittingTierId(ticket.id);

    try {
      const qty = quantities[ticket.id] || 1;
      const res = await api.createReservation({
        ticket_id: ticket.id,
        quantity: qty,
      });

      // Update active reservation in Auth Context
      setActiveReservation(res.reservation);

      if (onReservationCreated) {
        onReservationCreated(res.reservation);
      }
    } catch (err) {
      console.error('Reservation error:', err);
      setReservationError(err.message || 'Failed to create reservation');
      // Refresh event to see latest live availability
      fetchEvent();
    } finally {
      setSubmittingTierId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 animate-pulse space-y-6">
        <div className="h-6 bg-slate-200 rounded w-28"></div>
        <div className="h-48 bg-slate-200 rounded-3xl"></div>
        <div className="h-32 bg-slate-100 rounded-2xl"></div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 max-w-md mx-auto">
          <AlertCircle className="w-10 h-10 mx-auto mb-2 text-rose-500" />
          <h3 className="font-bold">Error Loading Event</h3>
          <p className="text-sm mt-1">{error || 'Event not found.'}</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-semibold"
          >
            Back to Events
          </button>
        </div>
      </div>
    );
  }

  const isCutoffPassed = new Date() > new Date(event.sales_cutoff_date);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Events</span>
      </button>

      {/* Main Event Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 p-8 text-white relative">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Organized by {event.organizer_name}
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
              Status: {event.status}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {event.title}
          </h1>

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-300">
            <div className="flex items-center space-x-1.5">
              <Calendar className="w-4 h-4 text-teal-400" />
              <span>
                {new Date(event.event_date).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <MapPin className="w-4 h-4 text-rose-400" />
              <span>{event.venue}</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>
                Sales Cutoff: {new Date(event.sales_cutoff_date).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Description & Sales Cutoff Notice */}
        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
              About this Event
            </h2>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">
              {event.description || 'No description provided by organizer.'}
            </p>
          </div>

          {isCutoffPassed && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600" />
              <div>
                <span className="font-bold block">Ticket Sales Have Closed</span>
                <span>The sales cutoff date for this event has elapsed. New reservations are disabled.</span>
              </div>
            </div>
          )}

          {reservationError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2 animate-in fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
              <div className="flex-1">
                <span className="font-bold block">Reservation Failed</span>
                <span>{reservationError}</span>
              </div>
            </div>
          )}

          {/* Ticket Tiers Section */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Select Ticket Tier</h3>
                <p className="text-xs text-slate-500">
                  Select quantity and lock your tickets for 10 minutes.
                </p>
              </div>
              <div className="flex items-center space-x-1 text-[11px] text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100 font-medium">
                <Lock className="w-3.5 h-3.5" />
                <span>10-Minute Hold Guarantee</span>
              </div>
            </div>

            <div className="space-y-4">
              {(event.tickets || []).map((ticket) => {
                const available = parseInt(ticket.available_quantity, 10);
                const isSoldOut = available <= 0;
                const isSubmitting = submittingTierId === ticket.id;
                const qty = quantities[ticket.id] || 1;

                return (
                  <div
                    key={ticket.id}
                    className={`p-5 rounded-2xl border transition ${
                      isSoldOut || isCutoffPassed
                        ? 'bg-slate-50 border-slate-200 opacity-75'
                        : 'bg-white border-slate-200 hover:border-teal-400 shadow-xs hover:shadow-sm'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Left: Tier name & pricing */}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-base text-slate-900">
                            {ticket.tier_name}
                          </span>
                          {isSoldOut ? (
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                              Sold Out
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {available} remaining
                            </span>
                          )}
                        </div>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">
                          ${(ticket.price / 100).toFixed(2)}
                          <span className="text-xs font-normal text-slate-500 ml-1">/ ticket</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Total capacity: {ticket.total_quantity} • Sold: {ticket.sold_quantity}
                        </div>
                      </div>

                      {/* Right: Quantity & Reserve Button */}
                      <div className="flex items-center space-x-3 self-end sm:self-center">
                        {!isSoldOut && !isCutoffPassed && (
                          <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1">
                            <button
                              type="button"
                              onClick={() => updateQuantity(ticket.id, -1, available)}
                              disabled={qty <= 1}
                              className="p-1 rounded-lg hover:bg-white text-slate-600 disabled:opacity-40 transition"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center text-xs font-bold text-slate-800">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(ticket.id, 1, available)}
                              disabled={qty >= available}
                              className="p-1 rounded-lg hover:bg-white text-slate-600 disabled:opacity-40 transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleReserve(ticket)}
                          disabled={isSoldOut || isCutoffPassed || isSubmitting}
                          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-xs ${
                            isSoldOut || isCutoffPassed
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/20 active:scale-98'
                          }`}
                        >
                          {isSubmitting ? (
                            <span>Holding...</span>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span>{isSoldOut ? 'Sold Out' : `Hold & Reserve ($${((ticket.price * qty) / 100).toFixed(2)})`}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
