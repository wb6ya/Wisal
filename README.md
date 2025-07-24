<div align="center">
  <img src="https://your-logo-url-here.com/logo.png" alt="Wisal Logo" width="150"/>
  <h1>Wisal - Professional WhatsApp Customer Service Platform</h1>
  <p><strong>A comprehensive, multi-tenant SaaS for managing WhatsApp Business API communications.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
    <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express.js">
    <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB">
    <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.io">
    <img src="https://img.shields.io/badge/Bootstrap-563D7C?style=for-the-badge&logo=bootstrap&logoColor=white" alt="Bootstrap">
  </p>
</div>

---

## 📝 Overview

**Wisal** is a comprehensive, multi-tenant Software as a Service (SaaS) platform designed to empower businesses to manage their WhatsApp customer communications professionally and efficiently. Moving beyond the limitations of the standard WhatsApp application, Wisal provides a centralized, feature-rich interface that allows customer service teams to collaborate, respond to inquiries, and automate repetitive tasks through an elegant and organized web dashboard.

## ✨ Key Features

We have built an integrated suite of features that makes the platform powerful and user-friendly:

* **🔐 Account & Team Management:**
    * **Multi-Tenant System**: Architected to serve multiple companies simultaneously, with complete data isolation to ensure privacy and security.
    * **Employee Management**: An admin-only interface to create, view, and delete employee (agent) accounts, each with their own login credentials.
    * **Secure Authentication**: A straightforward and secure login process for both company owners and employees.

* **🎨 Professional Chat Interface:**
    * **Elegant Design**: A professional "Graphite & Mint" dark-mode UI with a harmonious and easy-on-the-eyes color palette.
    * **Smart Conversation List**: An organized list of all conversations, showing a unique avatar for each customer, their name, phone number, a snippet of the last message, a relative timestamp, an unread message counter, and the conversation status.
    * **Real-Time Updates**: All new messages and status changes appear instantly on the dashboard without needing a page refresh, powered by Socket.IO.

* **🚀 Advanced Conversation Features:**
    * **Full Media Support**: Send and receive text messages, images, videos, audio messages, and all types of documents (PDF, Word, etc.).
    * **Secure Cloud Storage**: All media files are securely uploaded to **Cloudinary**, ensuring permanent storage and fast delivery.
    * **Quoted Replies**: Full support for replying to specific messages (text, image, etc.) with a preview of the original message and a "scroll-to" functionality.
    * **Message Status Ticks (✓✓)**: Display "sent," "delivered," and "read" statuses for agent messages.
    * **Instant Notifications**: Audio and browser push notifications for new incoming messages.

* **🛠️ Effective Management Tools:**
    * **Advanced Search**: Quickly filter the conversation list and perform detailed searches within a specific conversation.
    * **Conversation Status Management**: Ability to set the status of each conversation (e.g., New, In Progress, Resolved).
    * **Customer Notes**: A private notes section for agents to record important customer information.
    * **Initiate Conversations (Message Templates)**: Ability to start a new conversation with any customer using pre-approved message templates from Meta.

## 🛠️ Technology Stack

| Category             | Technology/Library         |
| :------------------- | :------------------------- |
| **Backend** | Node.js, Express.js        |
| **Database** | MongoDB, Mongoose          |
| **Real-Time Engine** | Socket.IO                  |
| **Frontend** | EJS, Custom CSS, Bootstrap |
| **File Storage** | Cloudinary                 |
| **Authentication** | express-session, bcrypt    |
| **File Handling** | Multer, mime-types         |

## 🚀 Getting Started

Follow these steps to set up and run the project on your local machine.

### Prerequisites

Ensure you have the following installed:
* [Node.js](https://nodejs.org/) (v16 or later)
* [npm](https://www.npmjs.com/) (comes with Node.js)
* A free account at [MongoDB Atlas](https://cloud.mongodb.com)
* A free account at [Cloudinary](https://cloudinary.com)
* A [Meta for Developers](https://developers.facebook.com/) account

### Installation Steps

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd whatsapp-saas
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up the environment file (`.env`):**
    * Create a new file named `.env` in the project's root directory.
    * Add the following variables, replacing the placeholder values with your actual credentials:
    ```
    MONGO_URI="Your MongoDB Atlas connection string"
    CLOUDINARY_CLOUD_NAME="Your Cloudinary cloud name"
    CLOUDINARY_API_KEY="Your Cloudinary API key"
    CLOUDINARY_API_SECRET="Your Cloudinary API secret"
    ```

4.  **Run the server:**
    ```bash
    node index.js
    ```
    > The application should now be running at `http://localhost:3000`.

## ⚙️ External Service Configuration

To get the application fully working, you must configure the following external services.

### 1. MongoDB Atlas Setup
1.  Create a new Cluster and choose the free M0 plan.
2.  Go to **Database Access** and create a new database user with a password.
3.  Go to **Network Access** and add the IP address `0.0.0.0/0` to allow connections from anywhere.
4.  Go to **Database**, click **Connect** -> **Drivers**, and copy the connection string.
5.  Paste the string into your `.env` file, replacing `<password>` with the database user's password you created.

### 2. Cloudinary Setup
1.  From your Cloudinary dashboard, copy the `Cloud Name`, `API Key`, and `API Secret` and add them to your `.env` file.
2.  Go to **Settings** (gear icon) -> **Upload**.
3.  In the **Upload Presets** section, create a new preset named `whatsapp_files` and ensure its **Signing Mode** is set to **Unsigned**.

### 3. Meta for Developers (WhatsApp API) Setup
1.  Go to Meta for Developers and create a new app of type **Business**.
2.  From the app dashboard, add the **WhatsApp** product.
3.  **Create a Permanent Access Token** by creating a "System User" and granting it `whatsapp_business_management` and `whatsapp_business_messaging` permissions.
4.  **Add and verify your business phone number**.
5.  **Configure the Webhook** in your Meta App settings:
    * **Callback URL**: Use an `ngrok` URL for local testing.
    * **Verify Token**: Enter a secret token of your choice.
    * **Webhook Fields**: Click "Manage" and subscribe to the `messages` field.
6.  **Save** your Permanent Access Token, Phone Number ID, and Verify Token in your application's settings dashboard.
