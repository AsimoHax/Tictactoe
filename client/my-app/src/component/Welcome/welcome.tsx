import React from "react";
import "./welcome.css";

const Welcome: React.FC = () => {
  return (
    <div className="welcome-container">
      <div className="welcome-box">
        <div className="content">
          <h2 className="title">Đăng nhập</h2>

          <form className="form">
            <div className="field">
              <label className="label">Email/Tên đăng nhập</label>
              <input type="text" placeholder="Email" className="input" />
            </div>
            <div className="field">
              <label className="label">Mật khẩu</label>
              <input type="password" placeholder="Mật khẩu" className="input" />
            </div>
            <div className="forgot">
              <a href="#">Quên mật khẩu?</a>
            </div>
            <button type="submit" className="button">
              Đăng nhập
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
