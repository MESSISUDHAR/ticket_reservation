import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Clock, ShieldCheck, CheckCircle, XCircle, AlertCircle, 
  ArrowLeft, CreditCard, RefreshCw, Ticket, Check, Copy 
} from 'lucide-react';

export default function CheckoutPage({ reservationId, onBack, onSuccessOrder }) {
  const { setActiveReservation, checkActiveReservations } = useAuth();
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(600);
  const [isExpired, setIsExpired] = useState(false);
  const [simAction, setSimAction] = useState('approve'); // 'approve' or 'decline'
  const [processing, setProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchReservation = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getReservation(reservationId);
      setReservation(res.reservation);
      setRemainingSeconds(res.reservation.remaining_seconds);
      setIsExpired(res.reservation.is_expired || res.reservation.status === 'expired');
    } catch (err) {
      setError(err.message || 'Failed to fetch reservation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reservationId) {
      fetchReservation();
    }
  }, [reservationId]);

  // 1-second interval countdown timer
  useEffect(() => {
    if (remainingSeconds <= 0 || isExpired || paymentResult) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds, isExpired, paymentResult]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleSimulatePayment = async () => {
    if (isExpired || remainingSeconds <= 0) {
      setError('Cannot process payment: Reservation has expired.');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const res = await api.processMockPayment({
        reservation_id: reservationId,
        action: simAction,
      });

      setPaymentResult(res);
      setActiveReservation(null);
      checkActiveReservations();

      if (onSuccessOrder && res.order) {
        onSuccessOrder(res.order);
      }
    } catch (err) {
      console.error('Payment failed:', err);
      // Payment decline returns 400 with data
      if (err.data && err.data.order) {
        setPaymentResult(err.data);
      } else {
        setError(err.message || 'Payment simulation failed');
      }
      setActiveReservation(null);
      checkActiveReservations();
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!window.confirm('Are you sure you want to cancel this reservation and release the tickets?')) {
      return;
    }

    setCancelling(true);
    try {
      await api.cancelReservation(reservationId);
      setActiveReservation(null);
      checkActiveReservations();
      onBack();
    } catch (err) {
      setError(err.message || 'Failed to cancel reservation');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 animate-pulse space-y-6">
        <div className="h-8 bg-slate-200 rounded-xl w-1/3"></div>
        <div className="h-64 bg-slate-100 rounded-2xl"></div>
      </div>
    );
  }

  if (error && !reservation) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700">
          <AlertCircle className="w-10 h-10 mx-auto mb-2 text-rose-500" />
          <h3 className="font-bold">Reservation Not Found</h3>
          <p className="text-sm mt-1">{error}</p>
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

  // Percentage for countdown progress ring
  const totalHoldSecs = 600;
  const progressPercent = Math.max(0, Math.min(100, (remainingSeconds / totalHoldSecs) * 100));

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Events</span>
      </button>

      {/* Outcome Banner if processed */}
      {paymentResult && (
        <div
          className={`p-6 rounded-3xl border shadow-lg animate-in zoom-in-95 duration-200 ${
            paymentResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center space-x-3 mb-4">
            {paymentResult.success ? (
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                <CheckCircle className="w-7 h-7" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
                <XCircle className="w-7 h-7" />
              </div>
            )}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Simulated Gateway Response
              </span>
              <h2 className="text-xl font-bold">
                {paymentResult.success
                  ? 'Payment Confirmed! Your Tickets are Booked.'
                  : 'Payment Declined — Reservation Released'}
              </h2>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {paymentResult.message || paymentResult.error}
          </p>

          <div className="mt-4 p-4 rounded-xl bg-white/80 border border-slate-200/80 text-xs space-y-1.5 font-mono">
            <div>
              <span className="text-slate-500 font-sans">Order ID: </span>
              <span className="font-bold text-slate-800">{paymentResult.order?.id}</span>
            </div>
            <div>
              <span className="text-slate-500 font-sans">Payment Ref: </span>
              <span className="font-bold text-slate-800">
                {paymentResult.transaction?.payment_reference || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-sans">Status: </span>
              <span
                className={`font-bold capitalize font-sans ${
                  paymentResult.success ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {paymentResult.order?.status}
              </span>
            </div>
          </div>

          <div className="mt-6 flex items-center space-x-3">
            <button
              onClick={onBack}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition"
            >
              Browse More Events
            </button>
          </div>
        </div>
      )}

      {/* Active Checkout Card */}
      {!paymentResult && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
          {/* 10-Minute Hold Countdown Bar */}
          <div
            className={`p-4 border-b flex items-center justify-between transition ${
              isExpired
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : remainingSeconds < 120
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-teal-50 border-teal-100 text-teal-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Clock
                className={`w-5 h-5 ${
                  isExpired ? 'text-rose-600' : 'text-teal-600 animate-pulse'
                }`}
              />
              <div>
                <span className="text-xs font-bold block uppercase tracking-wide">
                  {isExpired ? 'Reservation Expired' : 'Temporary Ticket Hold (10-Min)'}
                </span>
                <span className="text-[11px] text-slate-600">
                  {isExpired
                    ? 'Tickets have been returned to available pool'
                    : 'Tickets are locked exclusively for your checkout'}
                </span>
              </div>
            </div>

            {/* Countdown Badge */}
            <div
              className={`px-3 py-1.5 rounded-xl font-mono text-base font-extrabold border ${
                isExpired
                  ? 'bg-rose-100 text-rose-700 border-rose-300'
                  : remainingSeconds < 120
                  ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                  : 'bg-white text-teal-800 border-teal-200 shadow-xs'
              }`}
            >
              {isExpired ? '00:00' : formatTimer(remainingSeconds)}
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Event & Ticket Details */}
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-600">
                Order Summary
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
                {reservation.event_title}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {reservation.venue} • {new Date(reservation.event_date).toLocaleDateString()}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 font-medium">Tier:</span>
                <span className="font-bold text-slate-900">{reservation.tier_name}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 font-medium">Quantity:</span>
                <span className="font-bold text-slate-900">{reservation.quantity} ticket(s)</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 font-medium">Unit Price:</span>
                <span className="font-bold text-slate-900">
                  ${(reservation.price / 100).toFixed(2)}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-base">
                <span className="font-bold text-slate-900">Total Amount:</span>
                <span className="font-extrabold text-xl text-teal-700">
                  ${(reservation.total_amount / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Mock Payment Simulation Box */}
            <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-300">
                    Mock Payment Gateway Simulation
                  </span>
                </div>
                <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded border border-teal-500/30">
                  Asynchronous Mock
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Choose the simulated outcome to test both payment approval and rejected flow:
              </p>

              {/* Simulation outcome radio buttons */}
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`p-3 rounded-xl border cursor-pointer transition text-left flex items-start space-x-2.5 ${
                    simAction === 'approve'
                      ? 'border-teal-500 bg-teal-500/10 text-white'
                      : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="simAction"
                    value="approve"
                    checked={simAction === 'approve'}
                    onChange={() => setSimAction('approve')}
                    className="mt-0.5 text-teal-500 focus:ring-teal-400"
                  />
                  <div>
                    <span className="text-xs font-bold block text-teal-300">
                      Simulate Approval
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Confirms order & decrements inventory permanently
                    </span>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer transition text-left flex items-start space-x-2.5 ${
                    simAction === 'decline'
                      ? 'border-rose-500 bg-rose-500/10 text-white'
                      : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="simAction"
                    value="decline"
                    checked={simAction === 'decline'}
                    onChange={() => setSimAction('decline')}
                    className="mt-0.5 text-rose-500 focus:ring-rose-400"
                  />
                  <div>
                    <span className="text-xs font-bold block text-rose-300">
                      Simulate Decline
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Rejects payment & releases hold back to inventory
                    </span>
                  </div>
                </label>
              </div>

              {/* Payment Action Button */}
              <button
                type="button"
                onClick={handleSimulatePayment}
                disabled={processing || isExpired}
                className={`w-full py-3 px-4 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center space-x-2 ${
                  isExpired
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : simAction === 'approve'
                    ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-teal-500/20 active:scale-98'
                    : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20 active:scale-98'
                }`}
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Mock Gateway Asynchronously...</span>
                  </>
                ) : isExpired ? (
                  <span>Hold Expired - Cannot Process</span>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>
                      {simAction === 'approve'
                        ? `Pay $${(reservation.total_amount / 100).toFixed(2)} (Simulate Approval)`
                        : 'Trigger Payment Decline Simulation'}
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Cancel Hold Button */}
            {!isExpired && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleCancelReservation}
                  disabled={cancelling}
                  className="text-xs text-slate-500 hover:text-rose-600 transition"
                >
                  {cancelling ? 'Releasing hold...' : 'Cancel reservation & release tickets immediately'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
