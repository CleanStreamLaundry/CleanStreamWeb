import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/sideBar.css";
import { ChevronLeft, ChevronRight, Landmark, Map, LogOut, Home, PersonStanding, Hammer } from "lucide-react";
import { useAuth, useLocations } from "../di/container";

function SideBar() {
  const [open, setOpen] = useState(false);
  const { signOut } = useAuth();
  const locationService = useLocations();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    let active = true;
    locationService.fetchUserRole().then((role) => {
      if (active) setUserRole(role ?? "");
    });
    return () => { active = false; };
  }, [locationService]);

  const handleNav = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (!open) {
    return (
      <div className="sidebar-wrapper">
        <div className="closed-side-bar" onClick={() => setOpen(true)} />
        <button
          className="sidebar-toggle"
          onClick={() => setOpen(true)}
          aria-label="Open sidebar"
        >
          <ChevronRight />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-wrapper">
      <div className="side-bar-container">
        <button
          className="sidebar-toggle"
          onClick={() => setOpen(false)}
          aria-label="Close sidebar"
        >
          <ChevronLeft />
        </button>
        <button className="sidebar-item" onClick={() => handleNav("/home")}>
          <Home /> Dashboard
        </button>
        <button
          className="sidebar-item"
          onClick={() => handleNav("/home/refunds")}
        >
          <Landmark /> Refunds
        </button>
        <button className="sidebar-item" onClick={() => handleNav("/home/maintenance")}>
          <Hammer /> Maintenance
        </button>
        <button className="sidebar-item" onClick={() => handleNav("/home/locations")}></button>
        <button
          className="sidebar-item"
          onClick={() => handleNav("/home/locations")}
        >
          <Map /> Locations
        </button>
        {userRole === "Owner" && (
          <button
            className="sidebar-item"
            onClick={() => handleNav("/home/employees")}
          >
            <PersonStanding /> Employees
          </button>
        )}

        <div className="sidebar-divider" />

        <button className="sidebar-item sign-out" onClick={handleSignOut}>
          <LogOut /> Sign Out
        </button>
      </div>
    </div>
  );
}

export default SideBar;
