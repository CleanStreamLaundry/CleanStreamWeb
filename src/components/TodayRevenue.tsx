import { useEffect, useState } from "react";
import { useTransactions } from "../di/container";
import "../styles/TodayRevenue.css";

function RollingDigit({ digit }: { digit: string }) {
    const [displayDigit, setDisplayDigit] = useState(digit);
    const animating = digit !== displayDigit;

    useEffect(() => {
        if (animating) {
            const timeout = setTimeout(() => {
                setDisplayDigit(digit);
            }, 300);
            return () => clearTimeout(timeout);
        }
    }, [digit, animating]);

    return (
        <span className={`digit ${animating ? "rolling" : ""}`}>
            {displayDigit}
        </span>
    );
}

function RollingNumber({ value }: { value: string }) {
    return (
        <span className="rolling-number">
            {value.split("").map((char, i) =>
                /\d/.test(char)
                    ? <RollingDigit key={i} digit={char} />
                    : <span key={i} className="digit-static">{char}</span>
            )}
        </span>
    );
}

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
    }).format(value);

const todayLabel = () =>
    new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
    });

export default function TodayRevenue() {
    const repository = useTransactions();
    const getTodayRevenue = repository.getTodayRevenue;

    const [revenue, setRevenue] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchRevenue = async () => {
            try {
                const result = await getTodayRevenue();
                setError(result === null);
                if (result !== null) {
                    setRevenue(result);
                }
            } catch (e) {
                console.error("Error fetching revenue:", e);
                setError(true);
            }

            setLoading(false);
        };

        fetchRevenue();
    }, [getTodayRevenue]);

    return (
        <div className="dr-card">
            <div className="dr-glow" />

            <div className="dr-label">Daily Revenue</div>
            <div className="dr-date">{todayLabel()}</div>

            {loading ? (
                <div className="dr-amount loading" />
            ) : error ? (
                <div className="dr-amount error-state">Failed to load</div>
            ) : (
                <div className="dr-amount">
                    <RollingNumber value={formatCurrency(revenue ?? 0)} />
                </div>
            )}

            <div className="dr-divider" />

            <div className="dr-footer">
                <div className={`dr-dot ${error ? "error-dot" : ""}`} />
                {loading ? "Fetching..." : error ? "Query failed" : "Today"}
            </div>
        </div>
    );
}
