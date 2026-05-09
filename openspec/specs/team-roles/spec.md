## ADDED Requirements

### Requirement: Team SHALL wrap Server with resource management
Team SHALL extend or encapsulate a Envoy Server instance. Team SHALL accept the same options as Server plus an optional `resourceRoot` path (default: `resources/`). Team SHALL handle resource-related notify messages from Leader and Member.

#### Scenario: Team creation with default resource root
- **WHEN** a Team is created with `{ port: 9400 }`
- **THEN** Team SHALL create a Server on port 9400 and use `resources/` as the resource root directory

#### Scenario: Team creation with custom resource root
- **WHEN** a Team is created with `{ port: 9400, resourceRoot: "./data/knowledge" }`
- **THEN** Team SHALL use `./data/knowledge` as the resource root directory

### Requirement: Leader SHALL extend Client with resource write capability
Leader SHALL extend or encapsulate a Envoy Client. Leader SHALL connect to Team and register with `role: "leader"`. Leader SHALL provide methods to register, update, and delete resources.

#### Scenario: Leader connects to Team
- **WHEN** Leader connects to Team
- **THEN** Leader SHALL send a register message with `role: "leader"` in the payload

#### Scenario: Leader registers a resource
- **WHEN** Leader calls `registerResource(path, content)`
- **THEN** Leader SHALL send a `resource:register` notify to Team with the path and content

#### Scenario: Leader deletes a resource
- **WHEN** Leader calls `deleteResource(path)`
- **THEN** Leader SHALL send a `resource:delete` notify to Team with the path

### Requirement: Member SHALL extend Client with resource read capability
Member SHALL extend or encapsulate a Envoy Client. Member SHALL connect to Team and register with `role: "member"`. Member SHALL provide methods to query resource list and content. Member SHALL listen for `resource:changed` notifications.

#### Scenario: Member connects to Team
- **WHEN** Member connects to Team
- **THEN** Member SHALL send a register message with `role: "member"` in the payload

#### Scenario: Member queries resource list
- **WHEN** Member calls `listResources()`
- **THEN** Member SHALL send a `resource:query` notify with `{ type: "list" }` and return the result

#### Scenario: Member gets resource content
- **WHEN** Member calls `getResource(path)`
- **THEN** Member SHALL send a `resource:query` notify with `{ type: "get", path }` and return the content

#### Scenario: Member receives change notification
- **WHEN** Team broadcasts a `resource:changed` notification
- **THEN** Member SHALL emit a local `resource-changed` event with the change details

### Requirement: Team SHALL enforce role-based resource access
Team SHALL only allow Leader-role clients to register, update, and delete resources. Member-role clients SHALL only be allowed to query resources.

#### Scenario: Member attempts resource registration
- **WHEN** a Member sends a `resource:register` notify
- **THEN** Team SHALL reject the operation and return an error

#### Scenario: Member attempts resource deletion
- **WHEN** a Member sends a `resource:delete` notify
- **THEN** Team SHALL reject the operation and return an error

### Requirement: All three classes SHALL be exported from src/teamwork
The `src/teamwork/` module SHALL export Team, Leader, Member, and their option types. These SHALL be re-exported from `src/index.ts`.

#### Scenario: Import from envoy
- **WHEN** a consumer imports from `envoy`
- **THEN** Team, Leader, Member, TeamOptions, LeaderOptions, MemberOptions SHALL be available
