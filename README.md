# Phantom — Encrypted Messaging

<div align="center">
  <img src="public/icons/icon-192.png" alt="Phantom Logo" width="100"/>
  <p><strong>End-to-end encrypted ephemeral messaging. Anonymous, secure, and temporary.</strong></p>
</div>

Welcome to **Phantom**! This is an open-source, encrypted messaging web application built for privacy-conscious users. Messages are securely encrypted and optionally ephemeral. We believe in open-source and transparency, and we welcome contributions from developers worldwide!

## 🚀 Features

- **End-to-End Encryption**: Secure messaging where only the intended recipient can read the messages.
- **Ephemeral Messages**: Messages can be set to self-destruct after a certain period or after being read.
- **Anonymous Usage**: No personal identifiable information required.
- **Modern UI/UX**: Built with React, Tailwind CSS, and shadcn/ui for a beautiful, responsive experience.

## 🛠️ Technology Stack

This project leverages modern web technologies for performance and security:

- **Frontend Framework**: [React 18](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Backend/Database**: [Supabase](https://supabase.com/)

---

## 💻 Getting Started

Want to run Phantom locally or contribute to the project? Follow these steps to set up your development environment.

### Prerequisites

Ensure you have the following installed on your local machine:
- **Node.js**: `v18.0.0` or higher - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js) or **pnpm** / **yarn**
- **Git**

### Installation

1. **Fork & Clone the repository**
   ```bash
   git clone https://github.com/karanveerthakur1122/wispervault.git
   cd wispervault
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```
   *(If you prefer another package manager, use `yarn install` or `pnpm install`)*

3. **Set up Environment Variables**
   Create a `.env` file in the root directory and add the necessary Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   *Note: For local development, refer to the `.env.example` file if available.*

4. **Start the development server**
   ```bash
   npm run dev
   ```
   Your app will now be running on `http://localhost:5173` (or the port specified by Vite).

---

## 🤝 Contributing

We love our contributors! Whether it's fixing bugs, improving the documentation, or proposing new features, your help is appreciated.

### How to Contribute

1. **Fork the Repository**: Click the "Fork" button on the top right.
2. **Clone your Fork**: 
   ```bash
   git clone https://github.com/YOUR_USERNAME/wispervault.git
   ```
3. **Create a Branch**: 
   ```bash
   git checkout -b feature/your-feature-name 
   # or
   git checkout -b bugfix/issue-number
   ```
4. **Make your Changes**: Implement your feature or bug fix.
5. **Commit your Changes**: Use clear and descriptive commit messages.
   ```bash
   git commit -m "feat: add amazing new feature"
   ```
6. **Push to your Fork**: 
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request**: Go to the original repository and click "Compare & pull request". Provide a detailed description of your changes.

### Code Style Guidelines

- **TypeScript**: We use strict typing. Avoid `any` where possible.
- **Linting & Formatting**: Ensure you run `npm run lint` before committing to adhere to our ESLint and Prettier configurations.
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/). Example: `feat:`, `fix:`, `docs:`, `refactor:`.

### Setting up Lovable (Optional)

This project was originally bootstrapped with [Lovable](https://lovable.dev/). You can still use it by importing your forked repo, but all development can be done seamlessly locally using your favorite IDE.

---

## 🐛 Found a Bug or Have a Feature Request?

Please [open an issue](https://github.com/karanveerthakur1122/wispervault/issues) and provide as much detail as possible, including steps to reproduce the bug or the reasoning behind your feature request.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

<div align="center">
  Made with ❤️ by the open-source community.
</div>
