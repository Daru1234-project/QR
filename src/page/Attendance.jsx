import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { calculateDistance } from "../utils/distanceCalculation";
import Input from "../component/Input";
import { supabase } from "../utils/supabaseClient";
import toast from "react-hot-toast";
import Spinner from "../component/Spinner";
import dayjs from "dayjs";
import logo from "../../public/trackAS.png";

const StudentLogin = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);

  const [isLoading, setIsLoading] = useState(false);

  const [userDistance, setUserDistance] = useState(null);
  const [isWithinRange, setIsWithinRange] = useState(false);
  const [classDetails, setClassDetails] = useState(null);
  const [matricNumber, setMatricNumber] = useState("");
  const [name, setName] = useState("");
  const [userCoords, setUserCoords] = useState(null);
  const [targetCoords, setTargetCoords] = useState(null);
  const [thresholdMeters, setThresholdMeters] = useState(20);
  const [autoSwapEnabled, setAutoSwapEnabled] = useState(true);

  const courseId = queryParams.get("courseId");
  const courseCode = queryParams.get("courseCode");
  const lat = parseFloat(queryParams.get("lat"));
  const lng = parseFloat(queryParams.get("lng"));

  useEffect(() => {
    const fetchClassDetails = async () => {
      // First try to get exactly one row
      let classData = null;
      let error = null;

      const singleRes = await supabase
        .from("classes")
        .select("*")
        .eq("course_id", courseId)
        .single();

      classData = singleRes.data;
      error = singleRes.error;

      // If single() returned an error that indicates no rows, fallback to maybeSingle()
      if (error && /no rows|not found|Cannot coerce|single row/i.test(error.message || "")) {
        const maybeRes = await supabase
          .from("classes")
          .select("*")
          .eq("course_id", courseId)
          .maybeSingle();
        classData = maybeRes.data;
        error = maybeRes.error;
      }

      if (error) {
        console.error("Error fetching class details:", error);
      } else {
        setClassDetails(classData);
        // parse stored location field
        const rawLocation = classData?.location;
        console.debug("Fetched raw stored location:", rawLocation);
        const parsed = parsePoint(rawLocation);
        console.debug("Parsed target coords:", parsed);
        setTargetCoords(parsed);
      }
    };

    const getUserLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userLat = Number(position.coords.latitude);
            const userLng = Number(position.coords.longitude);
            setUserCoords({ lat: userLat, lng: userLng });

            // compute distance to target coords, with auto-swap heuristic
            let t = targetCoords ?? (lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null);
            if (!t) {
              setUserDistance(null);
              setIsWithinRange(false);
              return;
            }

            const d1 = calculateDistance(userLat, userLng, t.lat, t.lng);
            const dSwapped = calculateDistance(userLat, userLng, t.lng, t.lat);
            console.debug("Distance normal:", d1, "Distance swapped:", dSwapped);

            if (autoSwapEnabled && dSwapped < d1) {
              // adopt swapped coords
              t = { lat: Number(t.lng), lng: Number(t.lat) };
              console.debug("Adopting swapped target coords:", t);
            }

            setTargetCoords(t);
            const distance = calculateDistance(userLat, userLng, t.lat, t.lng);
            setUserDistance(distance);

            // Check if the distance is within thresholdMeters
            setIsWithinRange(distance <= Number(thresholdMeters));
          },
          (error) => {
            toast.error(`Error getting user location., ${error.message}`);
          }
        );
      } else {
        toast.error("Geolocation is not supported by this browser.");
      }
    };

    fetchClassDetails();
    getUserLocation();
  }, [courseId, lat, lng, targetCoords, thresholdMeters, autoSwapEnabled]);

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!matricNumber) {
      toast.error("Matriculation number is required.");
      return;
    }

    setIsLoading(true);

    try {
      const distance = userDistance;
      const studentName = name.toUpperCase();
      const matricNo = matricNumber.trim().toUpperCase();

      const { data: insertData, error: insertError } = await supabase
        .from("attendance")
        .insert({
          class_id: courseId,
          student_name: studentName,
          student_matric_no: matricNo,
          timestamp: new Date().toISOString(),
          is_present: true,
          distance_from_class: distance,
          location_verification_status: distance <= 20 ? "verified" : "out-of-range",
        })
        .select();

      if (insertError) {
        toast.error(`Error marking attendance: ${insertError.message}`);
        setIsLoading(false);
        return;
      }

      toast.success("Attendance marked successfully.");
      setMatricNumber("");
      setName("");
      setIsLoading(false);
      navigate("/success", { replace: true });
    } catch (err) {
      console.error("Unexpected error inserting attendance:", err);
      toast.error("Unexpected error marking attendance.");
      setIsLoading(false);
    }
  };

  return (
    <section className="studentLogin h-screen grid place-items-center ">
      <div className="bg-white px-6 py-4 md:px-16 max-w-3xl  rounded-xl">
        <div className="items-center flex self-center justify-center">
          <img src={logo} alt="logo" />
        </div>
        <h2 className="text-[2.5rem] text-[#000D46] text-center font-bold mb-2">
          TrackAS
        </h2>
        {classDetails && (
          <div className="flex justify-between items-center">
            <div>
              <div className="text-[#000D46] font-bold">Title {classDetails.course_title}</div>

              <div className="text-[#000D46]  font-bold">Code: {courseCode}</div>

              <div className="mt-2">
                <div className="text-[#000D46]  font-bold">Venue: {classDetails.location_name}</div>
                <div className="text-[#000D46]  font-bold">Date: {dayjs(classDetails.date).format("DD MMMM, YYYY")}</div>
                <div className="text-[#000D46]  font-bold">Time: {new Date(classDetails.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}</div>
                <div className="text-[#000D46] mb-2 text-lg font-bold">Note: {classDetails.note}</div>
                <div>Distance to Lecture Venue: {userDistance ? `${userDistance.toFixed(2)} meters` : "Calculating..."}</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 mb-4">
          <div className="text-sm mb-2">
            <b>Your coords:</b> {userCoords ? `${userCoords.lat.toFixed(6)}, ${userCoords.lng.toFixed(6)}` : "unknown"}
          </div>
          <div className="text-sm">
            <b>Target coords:</b> {targetCoords ? `${targetCoords.lat.toFixed(6)}, ${targetCoords.lng.toFixed(6)}` : "unknown"}
          </div>

          <div className="mt-2 flex gap-2 items-center">
            <label className="text-sm">Threshold meters:</label>
            <input type="number" min={1} max={500} value={thresholdMeters} onChange={(e) => setThresholdMeters(Number(e.target.value))} className="input input-sm w-24" />
            <label className="ml-4 text-sm">Auto-swap:</label>
            <input type="checkbox" checked={autoSwapEnabled} onChange={(e) => setAutoSwapEnabled(e.target.checked)} />
          </div>
        </div>
        <form onSubmit={handleRegister}>
          <Input
            type="text"
            name="name"
            label="Name"
            placeholder={"Enter your name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Input
            type="text"
            name="matricNumber"
            label="Matriculation Number"
            placeholder={"Your matriculation number"}
            value={matricNumber}
            onChange={(e) => setMatricNumber(e.target.value)}
          />

          {isWithinRange ? (
            <button className="btn my-5 btn-block text-lg" type="submit">
              {isLoading ? <Spinner /> : "Mark Attendance"}
            </button>
          ) : (
            <p className="text-xs text-red-500 pt-2">
              You must be within 20 meters of the lecture venue to register.
            </p>
          )}
        </form>
      </div>
    </section>
  );
};

export default StudentLogin;
