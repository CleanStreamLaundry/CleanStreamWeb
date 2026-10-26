import React, { useEffect, useState } from "react";
import { useMaintenance } from "../di/container"; 
import { getSupabaseClient } from "../supabase/client";
import type { Maintenance, MaintenanceService } from "../interfaces/MaintenanceService.ts";
import "../styles/MaintenancePage.css";

interface MaintenanceDashboardProps {
  maintenanceService?: MaintenanceService;
}

const MaintenanceDashboardPage: React.FC<MaintenanceDashboardProps> = () => {
  const { getMaintenances } = useMaintenance();
  const supabase = getSupabaseClient();
  
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [selectedItem, setSelectedItem] = useState<Maintenance | null>(null);

  useEffect(() => {
    let active = true;
    const fetchMaintenances = async () => {
      try {
        const data = await getMaintenances();
        if (!active) return;
        setMaintenances(Array.isArray(data) ? data : []);
        setError(null);
      } catch {
        if (active) setError("Failed to load maintenance requests");
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchMaintenances();
    return () => { active = false; };
  }, [getMaintenances]);

  const formatImageUrl = (url: string) => {
    return url.startsWith('http') ? url : `https://${url}`;
  };

  const handleViewAction = (item: Maintenance) => {
    if (item.image_data) {
      const fullUrl = formatImageUrl(item.image_data);
      window.open(fullUrl, "_blank");
    }
    setSelectedItem(item);
  };

  const handleDelete = async (maint_id: Maintenance["maint_id"]) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const idToSend = maint_id.toString();

      const response = await fetch('https://dnuuhupoxjtwqzaqylvb.functions.supabase.co/delete-maintenance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: idToSend }), 
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setMaintenances(prev => prev.filter(item => item.maint_id.toString() !== idToSend));
      if (selectedItem?.maint_id === maint_id) setSelectedItem(null);
    } catch {
      alert("Could not delete record.");
    }
  };

  const filteredData = filter === "All" 
    ? maintenances 
    : maintenances.filter(m => m.category === filter);

  const categories = ["All", ...new Set(maintenances.map(m => m.category))];

  if (loading) return <div className="loading-state">Loading maintenance reports...</div>;
  if (error) return <div className="error-state">{error}</div>;

  return (
    <div className="maintenance-page">
      <header className="maintenance-header">
        <div>
          <h1 className="maintenance-title">Maintenance Dashboard</h1>
          <p className="maintenance-subtitle">Review user requested maintenance reports</p>
        </div>
      </header>

      <hr className="header-divider" />

      <div className="maintenance-filters">
        {categories.map(cat => (
          <button
            key={cat}
            className={`filter-pill ${filter === cat ? "active" : ""}`}
            onClick={() => setFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="maintenance-table-wrapper">
        <table className="maintenance-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Location</th>
              <th>Description</th>
              <th>User ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length > 0 ? (
              filteredData.map((item, index) => (
                <tr key={item.maint_id?.toString() || index} className="clickable-row">
                  <td className="date-cell">
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <span className={`category-badge badge--${item.category?.toLowerCase() || 'default'}`}>
                      {item.category}
                    </span>
                  </td>
                  <td className="location-text">{item.location}</td>
                  <td className="description-cell">
                    <div className="description-text truncate">{item.description}</div>
                  </td>
                  <td><span className="user-id-code">{item.user_id}</span></td>
                  <td>
                    <div className="attachment-actions">
                      <button 
                        className="view-btn"
                        onClick={() => handleViewAction(item)}
                      >
                        View
                      </button>
                      <button 
                        className="delete-btn" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.maint_id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty-row">
                  No maintenance records found for this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>Maintenance Detail</h2>
              <button className="close-modal" onClick={() => setSelectedItem(null)}>&times;</button>
            </header>
            <div className="modal-body">
              <div className="modal-grid">
                <div className="modal-info-block">
                  <span className="modal-label">User ID:</span>
                  <p className="modal-value">{selectedItem.user_id}</p>
                </div>
                <div className="modal-info-block">
                  <span className="modal-label">Date Submitted:</span>
                  <p className="modal-value">{new Date(selectedItem.created_at).toLocaleString()}</p>
                </div>
                <div className="modal-info-block">
                  <span className="modal-label">Category:</span>
                  <p className="modal-value">{selectedItem.category}</p>
                </div>
                <div className="modal-info-block">
                  <span className="modal-label">Location:</span>
                  <p className="modal-value">{selectedItem.location}</p>
                </div>
              </div>
              <div className="modal-info-block full-width">
                <span className="modal-label">Full Description:</span>
                <p className="modal-description-text">{selectedItem.description}</p>
              </div>
              {selectedItem.image_data && (
                <div className="modal-info-block full-width">
                  <span className="modal-label">Attachment:</span>
                  <div className="modal-image-container">
                    <img 
                      src={formatImageUrl(selectedItem.image_data)} 
                      alt="Maintenance Evidence" 
                      className="modal-image"
                    />
                  </div>
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button className="modal-close-btn" onClick={() => setSelectedItem(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceDashboardPage;
