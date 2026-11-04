package com.seamnote.backend.auth.user;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface PasswordCredentialRepository extends JpaRepository<PasswordCredential, UUID> {}
