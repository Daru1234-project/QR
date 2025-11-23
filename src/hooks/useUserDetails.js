import { useState, useEffect } from "react";
import { supabase } from "../utils/supabaseClient";
import toast from "react-hot-toast";

const useUserDetails = () => {
  const [userDetails, setUserDetails] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUserDetails = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (session && session.user) {
          const authUserId = session.user.id;

          // Load lecturer row by auth_user_id
          const { data: userData, error: userError } = await supabase
            .from("lecturers")
            .select("*")
            .eq("auth_user_id", authUserId)
            .maybeSingle();

          if (userError) {
            throw userError;
          } else if (userData) {
            setUserDetails(userData);
          } else {
            setError("User details not found.");
          }
        } else {
          setError("User is not logged in.");
        }
      } catch (error) {
        toast.error(
          `${`${
            error.message === "TypeError: Failed to fetch"
              ? "Please, check your Internet connection"
              : error.message
          }`}`
        );
        setError(
          `${
            error.message === "TypeError: Failed to fetch"
              ? "Please, check your Internet connection"
              : error.message
          }`
        );
      }
    };

    fetchUserDetails();
  }, []);

  return { userDetails, userDetailsError: error };
};

export default useUserDetails;
