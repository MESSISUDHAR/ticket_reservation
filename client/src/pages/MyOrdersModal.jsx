import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { X, Ticket, Calendar, MapPin, CheckCircle, AlertCircle, ShoppingBag, ArrowRight } from 'lucide-react';

export default function MyOrdersModal({ isOpen, onClose, onSelectEvent }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadOrders();
    }
  }, [isOpen]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getMyOrders();
      setOrders(res.orders || []);
    } catch (err) {
      setError(err.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 border border-slate-200 animate-in fade-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">My Bookings & Orders</h2>
            <p className="text-xs text-slate-500">
              Your purchased event tickets and simulated receipts
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-400 animate-pulse text-xs">
            Loading your orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center bg-slate-50 rounded-2xl border border-slate-100 p-6">
            <Ticket className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-700">No orders placed yet</h3>
            <p className="text-xs text-slate-500 mt-1">
              Explore events and reserve tickets with our 10-minute hold.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {orders.map((ord) => (
              <div
                key={ord.order_id}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-teal-300 transition shadow-xs text-xs space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{ord.event_title}</h3>
                    <div className="flex items-center space-x-3 text-slate-500 text-[11px] mt-0.5">
                      <span className="flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-rose-500" />
                        <span>{ord.venue}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-teal-600" />
                        <span>{new Date(ord.event_date).toLocaleDateString()}</span>
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                      ord.order_status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {ord.order_status}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-800">
                      {ord.quantity}x {ord.tier_name}
                    </span>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      Ref: {ord.payment_reference || 'N/A'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-extrabold text-slate-900">
                      ${(ord.total_amount / 100).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      {new Date(ord.order_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
