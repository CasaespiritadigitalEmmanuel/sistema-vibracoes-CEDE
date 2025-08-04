// public/auth.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// SUAS CHAVES DE CONFIGURAÇÃO DO FIREBASE (JÁ DEVEM ESTAR CORRETAS)
const firebaseConfig = {
  apiKey: "AIzaSyBuYdERX224x0dzWtFH0mi__oVH3DxsmP0",
  authDomain: "vibracoes-cede.firebaseapp.com",
  projectId: "vibracoes-cede",
  storageBucket: "vibracoes-cede.firebasestorage.app",
  messagingSenderId: "1081610853181",
  appId: "1:1081610853181:web:b10eb65f1506d141684354"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * Função que protege uma página. Verifica se há um usuário logado.
 * Se não houver, redireciona para a página de login.
 * Retorna uma promessa que resolve com os dados do usuário se ele estiver logado.
 */
export function protegerPagina() {
    return new Promise((resolve, reject) => {
        // O unsubscribe garante que o listener não seja chamado múltiplas vezes desnecessariamente
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe(); // Remove o listener após a primeira verificação
            if (user) {
                // Usuário está logado, permite o acesso à página.
                resolve(user);
            } else {
                // Usuário não está logado, redireciona para o login.
                window.location.href = '/login.html';
                reject('Usuário não autenticado');
            }
        });
    });
}

/**
 * Função para fazer login.
 * @param {string} email 
 * @param {string} senha 
 * @returns Promessa com o resultado do login.
 */
export function fazerLogin(email, senha) {
    return signInWithEmailAndPassword(auth, email, senha);
}

/**
 * Função para fazer logout.
 */
export function fazerLogout() {
    return signOut(auth);
}