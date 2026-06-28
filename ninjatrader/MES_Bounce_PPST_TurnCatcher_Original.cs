//#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Windows.Media;
using NinjaTrader.Data;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.Strategies;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Strategies
{
    public class MES_Bounce_PPST_TurnCatcher : Strategy
    {
        [NinjaScriptProperty, Range(1, int.MaxValue)]
        public int PivotLength_L { get; set; } = 10;

        [NinjaScriptProperty, Range(1, 5)]
        public int RecentLevels_K { get; set; } = 1;

        [NinjaScriptProperty, Range(1, 50)]
        public int PPST_Prd { get; set; } = 4;

        [NinjaScriptProperty, Range(1.0, 10.0)]
        public double PPST_Factor { get; set; } = 2.0;

        [NinjaScriptProperty, Range(1, 100)]
        public int PPST_ATR_Period { get; set; } = 7;

        [NinjaScriptProperty]
        public bool UseSessionFilter { get; set; } = true;

        [NinjaScriptProperty, Range(1, 200)]
        public int StdWindow { get; set; } = 20;

        [NinjaScriptProperty, Range(0.0, 5.0)]
        public double KSigma { get; set; } = 0.75;

        [NinjaScriptProperty]
        public double DailyMaxLossUSD { get; set; } = 400.0;

        [NinjaScriptProperty]
        public bool UseRealTimePnL { get; set; } = true;

        [NinjaScriptProperty, Range(0, 5)]
        public int EntryOffsetTicks { get; set; } = 1;

        [NinjaScriptProperty, Range(0, 10)]
        public int WickPenetrationTicks { get; set; } = 2;

        [NinjaScriptProperty]
        public bool AggressiveIntrabar { get; set; } = true;

        [NinjaScriptProperty]
        public bool UseLimitEntry { get; set; } = true;

        private Swing swing;
        private ATR atr;
        private ADX adx;
        private Series<double> Center;
        private Series<double> TUp, TDown;
        private Series<int> Trend;
        private Series<double> HL2Series;
        private StdDev StdHL2;
        private readonly List<double> recentSupports = new List<double>();
        private readonly List<double> recentResistances = new List<double>();
        private bool tradingHaltedToday = false;
        private DateTime currentSessionDate;
        private double dailyStartRealized = 0.0;

        private const string TAG_SUP = "SRV_Sup";
        private const string TAG_RES = "SRV_Res";
        private const string TAG_SUPTRIG = "SRV_SupTrig";
        private const string TAG_RESTRIG = "SRV_ResTrig";

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "MES_Bounce_PPST_TurnCatcher";
                Calculate = Calculate.OnEachTick;
                EntriesPerDirection = 1;
                EntryHandling = EntryHandling.AllEntries;
                IsOverlay = true;
            }
            else if (State == State.DataLoaded)
            {
                swing = Swing(this.PivotLength_L);
                atr = ATR(this.PPST_ATR_Period);
                adx = ADX(7);
                Center = new Series<double>(this);
                TUp = new Series<double>(this);
                TDown = new Series<double>(this);
                Trend = new Series<int>(this);
                HL2Series = new Series<double>(this);
                StdHL2 = StdDev(HL2Series, this.StdWindow);
            }
        }

        private bool InRTH()
        {
            if (!this.UseSessionFilter) return true;
            int t = ToTime(Time[0]);
            return t >= 93000 && t <= 160000;
        }

        private double CumRealized() =>
            this.UseRealTimePnL ? SystemPerformance.RealTimeTrades.TradesPerformance.Currency.CumProfit
                                : SystemPerformance.AllTrades.TradesPerformance.Currency.CumProfit;

        private double GetDailyRealized() => CumRealized() - dailyStartRealized;

        private void ResetDailyIfNewSession()
        {
            if (Time[0].Date != currentSessionDate)
            {
                currentSessionDate = Time[0].Date;
                tradingHaltedToday = false;
                dailyStartRealized = CumRealized();
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < Math.Max(Math.Max(this.PivotLength_L * 2 + 5, this.PPST_ATR_Period + 5), this.StdWindow + 5)) return;
            ResetDailyIfNewSession();
            if (!InRTH()) { RemoveAllLines(); return; }
            if (!tradingHaltedToday && GetDailyRealized() <= -Math.Abs(this.DailyMaxLossUSD))
            {
                tradingHaltedToday = true;
                if (Position.MarketPosition == MarketPosition.Long) ExitLong("DailyStop_XL", "L1");
                if (Position.MarketPosition == MarketPosition.Short) ExitShort("DailyStop_XS", "S1");
            }
            if (tradingHaltedToday) { RemoveAllLines(); return; }

            HL2Series[0] = (High[0] + Low[0]) * 0.5;
            double sigma = StdHL2[0];
            if (double.IsNaN(sigma)) { RemoveAllLines(); return; }

            if (!double.IsNaN(swing.SwingLow[0]))
            {
                recentSupports.Insert(0, swing.SwingLow[0]);
                if (recentSupports.Count > this.RecentLevels_K)
                    recentSupports.RemoveAt(recentSupports.Count - 1);
            }
            if (!double.IsNaN(swing.SwingHigh[0]))
            {
                recentResistances.Insert(0, swing.SwingHigh[0]);
                if (recentResistances.Count > this.RecentLevels_K)
                    recentResistances.RemoveAt(recentResistances.Count - 1);
            }

            double sup = recentSupports.Count > 0 ? recentSupports[0] : double.NaN;
            double res = recentResistances.Count > 0 ? recentResistances[0] : double.NaN;
            double lastPP = !double.IsNaN(swing.SwingHigh[0]) ? swing.SwingHigh[0] : !double.IsNaN(swing.SwingLow[0]) ? swing.SwingLow[0] : double.NaN;
            double prevCenter = (CurrentBar > 0 && !double.IsNaN(Center[1])) ? Center[1] : Close[0];
            double curCenter = !double.IsNaN(lastPP) ? ((prevCenter * 2.0) + lastPP) / 3.0 : prevCenter;
            Center[0] = curCenter;
            double up = curCenter - (this.PPST_Factor * atr[0]);
            double dn = curCenter + (this.PPST_Factor * atr[0]);
            double prevTUp = (CurrentBar > 0 && !double.IsNaN(TUp[1])) ? TUp[1] : up;
            double prevTDown = (CurrentBar > 0 && !double.IsNaN(TDown[1])) ? TDown[1] : dn;
            TUp[0] = (Close[1] > prevTUp) ? Math.Max(up, prevTUp) : up;
            TDown[0] = (Close[1] < prevTDown) ? Math.Min(dn, prevTDown) : dn;
            Trend[0] = Close[0] > prevTDown ? 1 : Close[0] < prevTUp ? -1 : Trend[1];

            double supTrig = !double.IsNaN(sup) ? sup + (this.KSigma * sigma) : double.NaN;
            double resTrig = !double.IsNaN(res) ? res - (this.KSigma * sigma) : double.NaN;

            DrawOrRemove(TAG_SUP, sup, Brushes.LimeGreen);
            DrawOrRemove(TAG_RES, res, Brushes.Red);
            DrawOrRemove(TAG_SUPTRIG, supTrig, Brushes.Teal);
            DrawOrRemove(TAG_RESTRIG, resTrig, Brushes.DarkOrange);

            double adxValue = adx[0];
            if (adxValue <= 25) return;

            bool touchedSupport = !double.IsNaN(supTrig) && Low[0] <= (supTrig - this.WickPenetrationTicks * TickSize);
            bool touchedResist = !double.IsNaN(resTrig) && High[0] >= (resTrig + this.WickPenetrationTicks * TickSize);
            bool longConfirm = (Trend[0] == 1) && Close[0] > supTrig;
            bool shortConfirm = (Trend[0] == -1) && Close[0] < resTrig;

            if (Position.MarketPosition == MarketPosition.Flat)
            {
                if (touchedSupport && longConfirm)
                {
                    if (this.UseLimitEntry)
                        EnterLongLimit(1, supTrig + this.EntryOffsetTicks * TickSize, "L1");
                    else
                        EnterLong(1, "L1");
                    return;
                }
                if (touchedResist && shortConfirm)
                {
                    if (this.UseLimitEntry)
                        EnterShortLimit(1, resTrig - this.EntryOffsetTicks * TickSize, "S1");
                    else
                        EnterShort(1, "S1");
                    return;
                }
            }

            bool longToReverse = (!double.IsNaN(resTrig) && Close[1] <= resTrig && Close[0] >= resTrig);
            bool shortToReverse = (!double.IsNaN(supTrig) && Close[1] >= supTrig && Close[0] <= supTrig);

            if (Position.MarketPosition == MarketPosition.Long && longToReverse)
            {
                ExitLong("XL1", "L1");
                EnterShort(1, "S1");
                return;
            }
            if (Position.MarketPosition == MarketPosition.Short && shortToReverse)
            {
                ExitShort("XS1", "S1");
                EnterLong(1, "L1");
            }
        }

        private void DrawOrRemove(string tag, double price, Brush brush)
        {
            if (double.IsNaN(price)) { TryRemoveLine(tag); return; }
            Draw.HorizontalLine(this, tag, price, brush);
        }

        private void TryRemoveLine(string tag)
        {
            try { RemoveDrawObject(tag); } catch { }
        }

        private void RemoveAllLines()
        {
            TryRemoveLine(TAG_SUP);
            TryRemoveLine(TAG_RES);
            TryRemoveLine(TAG_SUPTRIG);
            TryRemoveLine(TAG_RESTRIG);
        }
    }
}
