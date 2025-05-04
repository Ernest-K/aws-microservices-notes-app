import { useState, useEffect } from "react";
import { authService } from "../../services/authService";
import { Card, Container, Heading, DataList, Flex, Button } from "@radix-ui/themes";
import { Link } from "react-router-dom";

const Profile = () => {
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await authService.getProfile();
        setProfileData({
          firstName: profile.firstName || "",
          lastName: profile.lastName || "",
          email: profile.email || "",
        });
      } catch (error) {
        console.error(error);
      }
    };

    fetchProfile();
  }, []);

  return (
    <Container>
      <Flex direction={"column"} gap={"3"} justify={"center"}>
        <Heading>My profile</Heading>
        <Card>
          <DataList.Root>
            <DataList.Item>
              <DataList.Label>Email</DataList.Label>
              <DataList.Value>{profileData.email}</DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label>First Name</DataList.Label>
              <DataList.Value>{profileData.firstName}</DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label>Last Name</DataList.Label>
              <DataList.Value>{profileData.lastName}</DataList.Value>
            </DataList.Item>
          </DataList.Root>
        </Card>
        <Button asChild variant="outline" style={{ flexGrow: "0", width: "auto" }}>
          <Link to="/forgot-password">Forgot password</Link>
        </Button>
      </Flex>
    </Container>
  );
};

export default Profile;
