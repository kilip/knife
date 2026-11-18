Feature: Authenticated Terminal Workspace

  Scenario: Authenticated user loads the workspace and sees an active xterm terminal
    Given a Knife server running in configured mode
    And the browser has a valid session cookie for "octocat"
    When the user visits "/"
    Then the HTTP response status should be 200
    And the terminal workspace should be rendered
    And there should be no CSP or runtime page errors
