package com.seamnote.backend.auth.oauth;

import com.seamnote.backend.auth.session.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.*;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.client.web.*;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.net.URI;
import java.util.Arrays;

@Configuration
@Conditional(GoogleAvailable.class)
public class GoogleOAuthConfig {
    @Bean ClientRegistrationRepository googleClients(
        @Value("${seam.auth.google.client-id}") String clientId,
        @Value("${seam.auth.google.client-secret}") String clientSecret,
        @Value("${seam.auth.google.redirect-uri}") String redirect,
        @Value("${seam.auth.frontend-origin}") String frontend) {
        validateFrontend(frontend, redirect);
        var client=org.springframework.security.config.oauth2.client.CommonOAuth2Provider.GOOGLE.getBuilder("google")
            .clientId(clientId).clientSecret(clientSecret).redirectUri(redirect)
            .scope("openid","email","profile").build();
        return new InMemoryClientRegistrationRepository(client);
    }
    static void validateFrontend(String frontend, String redirect) {
        try {
            var origin=URI.create(frontend);var callback=URI.create(redirect);
            boolean local="http".equals(origin.getScheme()) && ("localhost".equals(origin.getHost()) || "127.0.0.1".equals(origin.getHost()));
            if (!(local || "https".equals(origin.getScheme())) || origin.getHost()==null || origin.getUserInfo()!=null
                || origin.getRawQuery()!=null || origin.getFragment()!=null || !(origin.getPath().isEmpty() || origin.getPath().equals("/"))
                || !origin.getScheme().equals(callback.getScheme()) || !origin.getAuthority().equals(callback.getAuthority())
                || !"/api/auth/oauth2/callback/google".equals(callback.getPath()) || callback.getRawQuery()!=null || callback.getFragment()!=null) throw new IllegalArgumentException();
        } catch (RuntimeException failure) { throw new IllegalStateException("Google callback must match the fixed frontend origin (values redacted)"); }
    }
    private static String cookie(HttpServletRequest request) {
        return request.getCookies()==null?null:Arrays.stream(request.getCookies()).filter(c->c.getName().equals(RefreshCookie.NAME)).map(Cookie::getValue).findFirst().orElse(null);
    }
    private static void clearTemporarySession(HttpServletRequest request) {
        var session=request.getSession(false);if(session!=null)session.invalidate();SecurityContextHolder.clearContext();
    }
    private static final class TransientClients implements OAuth2AuthorizedClientRepository {
        @Override public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String id,Authentication principal,HttpServletRequest request){return null;}
        @Override public void saveAuthorizedClient(OAuth2AuthorizedClient client,Authentication principal,HttpServletRequest request,HttpServletResponse response){}
        @Override public void removeAuthorizedClient(String id,Authentication principal,HttpServletRequest request,HttpServletResponse response){}
    }
    @Bean @Order(0)
    SecurityFilterChain googleOAuth(HttpSecurity http, ClientRegistrationRepository clients, ExternalIdentities identities,
        RefreshSessions sessions, RefreshCookie cookies, @Value("${seam.auth.frontend-origin}") String frontend) throws Exception {
        var resolver=new DefaultOAuth2AuthorizationRequestResolver(clients,"/api/auth/oauth2/authorization");
        resolver.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
        String origin=frontend.replaceAll("/$", "");
        http.securityMatcher("/api/auth/oauth2/**").authorizeHttpRequests(r->r.anyRequest().permitAll())
            .sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
            .securityContext(s->s.securityContextRepository(new NullSecurityContextRepository()))
            .requestCache(c->c.disable())
            .addFilterBefore(new OncePerRequestFilter() {
                @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException {
                    response.setHeader(HttpHeaders.CACHE_CONTROL,"no-store");response.setHeader("Referrer-Policy","no-referrer");
                    if(request.getServletPath().equals("/api/auth/oauth2/authorization/google"))request.getSession().setMaxInactiveInterval(300);
                    chain.doFilter(request,response);
                }
            }, OAuth2AuthorizationRequestRedirectFilter.class)
            .oauth2Login(oauth->oauth.clientRegistrationRepository(clients).authorizedClientRepository(new TransientClients())
                .loginPage("/login").authorizationEndpoint(a->a.authorizationRequestResolver(resolver))
                .redirectionEndpoint(r->r.baseUri("/api/auth/oauth2/callback/*"))
                .successHandler((request,response,authentication)->{
                    try {
                        var user=identities.resolve((OidcUser)authentication.getPrincipal());
                        sessions.logout(cookie(request));var issued=sessions.create(user);
                        clearTemporarySession(request);cookies.set(response,issued.refreshToken());
                        response.sendRedirect(origin+"/auth/complete");
                    } catch (RuntimeException failure) {
                        clearTemporarySession(request);response.sendRedirect(origin+"/login?oauth=failed");
                    }
                })
                .failureHandler((request,response,failure)->{
                    clearTemporarySession(request);response.sendRedirect(origin+"/login?oauth=failed");
                }));
        return http.build();
    }
}
